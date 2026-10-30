import {createImageEditor} from './image-editor.js';
import {createOpenAIClient, StudioError} from './openai.mjs';

const rows = new Map();
const rowsContainer = document.querySelector('#image-rows');
const fileInput = document.querySelector('#file-input');
const uploadError = document.querySelector('#upload-error');
let nextId = 0;
let uploadTarget = null;
let uploading = false;
let configured = false;
const API_KEY_STORAGE = 'holzwerkskunst.image-studio.api-key';
const API_KEY_PATTERN = /^[\x21-\x7e]{1,4096}$/;
const apiSettings = document.querySelector('#api-settings');
const apiKeyInput = document.querySelector('#api-key-input');
const apiKeyFeedback = document.querySelector('#api-key-feedback');
let browserApiKey = '';
let storedKeyPresent = false;
const openAI = createOpenAIClient({getApiKey: () => browserApiKey});

function keyFeedback(text, tone = '') {
  apiKeyFeedback.textContent = text;
  apiKeyFeedback.dataset.tone = tone;
}

function loadBrowserKey() {
  try {
    const saved = localStorage.getItem(API_KEY_STORAGE);
    storedKeyPresent = saved !== null;
    const candidate = saved?.trim() || '';
    browserApiKey = API_KEY_PATTERN.test(candidate) ? candidate : '';
    keyFeedback('');
    if (storedKeyPresent && !browserApiKey)
      keyFeedback(
        'Der gespeicherte Schlüssel hat ein ungültiges Format. Bitte ersetzen oder löschen.',
        'error',
      );
  } catch {
    browserApiKey = '';
    storedKeyPresent = false;
    keyFeedback(
      'Local Storage ist in diesem Browser nicht verfügbar. Bitte die Browser-Einstellungen prüfen.',
      'error',
    );
  }
}

function updateKeyState() {
  configured = Boolean(browserApiKey);
  const status = document.querySelector('#connection-status');
  status.textContent = configured ? 'Browser-Schlüssel aktiv' : 'API-Schlüssel fehlt';
  status.classList.toggle('is-ready', configured);
  document.querySelector('#api-key-source').textContent = browserApiKey
    ? 'Im Browser gespeichert'
    : storedKeyPresent
      ? 'Gespeicherten Schlüssel prüfen'
      : 'Kein Browser-Schlüssel gespeichert';
  document.querySelector('#api-key-delete').disabled = !storedKeyPresent;
  apiKeyInput.placeholder = browserApiKey ? 'Neuen Schlüssel zum Ersetzen eingeben' : 'sk-…';
  document.querySelector('#setup-banner').hidden = configured;
  rows.forEach(updateRow);
}

document.querySelectorAll('[data-open-api-settings]').forEach((button) =>
  button.addEventListener('click', () => {
    apiSettings.open = true;
    apiSettings.scrollIntoView({behavior: 'smooth', block: 'center'});
    apiKeyInput.focus({preventScroll: true});
  }),
);
document.querySelector('#api-key-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const key = apiKeyInput.value.trim();
  if (!API_KEY_PATTERN.test(key)) {
    keyFeedback(
      'Bitte einen Schlüssel ohne Leerzeichen oder Zeilenumbrüche eingeben (maximal 4096 Zeichen).',
      'error',
    );
    return;
  }
  try {
    localStorage.setItem(API_KEY_STORAGE, key);
  } catch {
    keyFeedback(
      'Speichern fehlgeschlagen. Local Storage ist möglicherweise blockiert oder voll. Der Schlüssel wurde nicht übernommen.',
      'error',
    );
    return;
  }
  browserApiKey = key;
  storedKeyPresent = true;
  apiKeyInput.value = '';
  keyFeedback(
    'Im Browser gespeichert. Der Schlüssel wird bei deiner nächsten API-Anfrage verwendet; er wurde noch nicht bei OpenAI geprüft.',
  );
  updateKeyState();
});
document.querySelector('#api-key-delete').addEventListener('click', () => {
  try {
    localStorage.removeItem(API_KEY_STORAGE);
  } catch {
    keyFeedback(
      'Der gespeicherte Schlüssel konnte nicht gelöscht werden. Bitte die Browser-Einstellungen prüfen.',
      'error',
    );
    return;
  }
  browserApiKey = '';
  storedKeyPresent = false;
  apiKeyInput.value = '';
  keyFeedback(
    'Browser-Schlüssel gelöscht. Bitte einen Schlüssel speichern, um API-Anfragen zu starten.',
  );
  updateKeyState();
});
window.addEventListener('storage', (event) => {
  if (event.key !== null && event.key !== API_KEY_STORAGE) return;
  loadBrowserKey();
  updateKeyState();
});
loadBrowserKey();
const imageEditor = createImageEditor(document.querySelector('#image-editor'));
const resultViewer = document.querySelector('#result-viewer');
let viewedRow = null;

function viewResult(row) {
  if (!row.result || row.busy || row.editing || resultViewer.open) return;
  viewedRow = row;
  const image = resultViewer.querySelector('.result-viewer-image');
  image.src = row.result;
  image.alt = row.element.querySelector('.result-image').alt;
  resultViewer.querySelector('#result-viewer-filename').textContent = row.filename;
  const download = resultViewer.querySelector('#result-viewer-download');
  download.href = row.downloadUrl;
  download.download = row.element.querySelector('.button-download').download;
  resultViewer.showModal();
}

resultViewer
  .querySelector('.result-viewer-close')
  .addEventListener('click', () => resultViewer.close());
resultViewer.addEventListener('click', (event) => {
  if (event.target === resultViewer || event.target.classList.contains('result-viewer-stage'))
    resultViewer.close();
});
resultViewer.addEventListener('keydown', (event) => {
  if (event.key !== 'Tab') return;
  const first = resultViewer.querySelector('#result-viewer-download');
  const last = resultViewer.querySelector('.result-viewer-close');
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
});
resultViewer.addEventListener('close', () => {
  const opener = viewedRow?.element.querySelector('[data-action="view"]');
  viewedRow = null;
  resultViewer.querySelector('.result-viewer-image').removeAttribute('src');
  resultViewer.querySelector('#result-viewer-download').removeAttribute('href');
  if (opener?.isConnected && !opener.disabled) opener.focus({preventScroll: true});
});
const costHistory = [];
const euro = new Intl.NumberFormat('de-DE', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 4,
  maximumFractionDigits: 4,
});
const dollar = new Intl.NumberFormat('de-DE', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 4,
  maximumFractionDigits: 4,
});
const actionName = (action) =>
  ({analyze: 'Analyse', improve: 'Verbesserung', generate: 'Generierung', refine: 'Anpassung'})[
    action
  ];
const euroAmount = (amount) => (amount > 0 && amount < 0.0001 ? '< 0,0001 €' : euro.format(amount));
const hasEuro = (cost) =>
  ['estimated', 'not_requested'].includes(cost?.status) &&
  Number.isFinite(cost.eur) &&
  cost.eur >= 0;

function costLabel(cost) {
  if (cost?.status === 'pending') return 'Kosten werden ermittelt …';
  if (cost?.status === 'not_requested') return '0,0000 € · nicht an OpenAI gesendet';
  if (hasEuro(cost)) return `≈ ${euroAmount(cost.eur)}`;
  if (cost?.status === 'estimated' && Number.isFinite(cost.usd))
    return `≈ ${dollar.format(cost.usd)} · Euro-Kurs fehlt`;
  return 'Kosten unbekannt';
}

function costSummary(entries) {
  const sum = entries.reduce(
    (total, entry) => total + (hasEuro(entry.cost) ? entry.cost.eur : 0),
    0,
  );
  const pending = entries.filter((entry) => entry.cost?.status === 'pending').length;
  const unknown = entries.filter(
    (entry) => entry.cost?.status !== 'pending' && !hasEuro(entry.cost),
  ).length;
  return `${entries.length ? '≈ ' : ''}${euroAmount(sum)}${
    unknown ? ` + ${unknown} unbekannt` : ''
  }${pending ? ` + ${pending} offen` : ''}`;
}

function costExplanation(cost) {
  const reasons = {
    model_price_unknown: 'Für dieses Modell ist kein Preis hinterlegt.',
    service_tier_unknown: 'Für diesen Service-Tarif ist kein Preis hinterlegt.',
    usage_missing: 'Kein vollständiger Verbrauch empfangen; möglicherweise trotzdem berechnet.',
    usage_incomplete: 'Die API hat keinen eindeutig berechenbaren Verbrauch geliefert.',
    exchange_rate_unavailable: 'EZB-Kurs nicht verfügbar; der bekannte USD-Betrag bleibt erhalten.',
  };
  if (cost?.status === 'pending') return 'Die Anfrage läuft.';
  if (cost?.status === 'not_requested') return 'Keine kostenpflichtige API-Anfrage gestartet.';
  const parts = [cost?.model, reasons[cost?.reason]];
  if (cost?.usage)
    parts.push(`${cost.usage.inputTokens} Input- / ${cost.usage.outputTokens} Output-Tokens`);
  if (cost?.pricingDate) parts.push(`Preisstand ${cost.pricingDate}`);
  const rate = cost?.exchangeRate;
  if (rate)
    parts.push(
      `1 USD = ${rate.usdToEur.toFixed(6)} EUR (${
        rate.source === 'manual' ? 'manuell' : `EZB via Frankfurter ${rate.date}`
      }${rate.stale ? ', zuletzt verfügbarer Kurs' : ''})`,
    );
  return parts.filter(Boolean).join(' · ');
}

function renderCosts() {
  document.querySelector('#session-cost-total').textContent = costSummary(costHistory);
  document.querySelector('#cost-empty').hidden = costHistory.length > 0;
  const history = document.querySelector('#cost-history');
  history.replaceChildren();
  for (const entry of costHistory) {
    const item = document.createElement('li');
    const main = document.createElement('span');
    main.textContent = `${entry.time} · ${entry.filename} · ${actionName(
      entry.action,
    )}: ${costLabel(entry.cost)}`;
    const detail = document.createElement('small');
    detail.textContent = costExplanation(entry.cost);
    item.append(main, detail);
    history.append(item);
  }
  for (const row of rows.values()) {
    const entries = costHistory.filter((entry) => entry.rowId === row.id);
    const total = row.element.querySelector('.row-cost');
    total.hidden = entries.length === 0;
    total.textContent = `Zeile: ${costSummary(entries)}`;
    for (const action of ['analyze', 'improve', 'generate', 'refine']) {
      const entry = entries.findLast((item) => item.action === action);
      const label = row.element.querySelector(`.${action}-cost`);
      label.hidden = !entry;
      label.textContent = entry ? `Letzte ${actionName(action)}: ${costLabel(entry.cost)}` : '';
      label.title = entry ? costExplanation(entry.cost) : '';
    }
  }
}

function message(row, text, tone = '') {
  row.element.querySelector('.row-message').textContent = text;
  row.element.querySelector('.row-message').dataset.tone = tone;
}

function promptCurrent(row) {
  return Boolean(
    row.draft.value.trim() &&
      row.promptContext &&
      row.promptContext.imageRevision === row.imageRevision &&
      row.promptContext.size === row.size.value,
  );
}

function updateRow(row) {
  const busy = Boolean(row.busy);
  const locked = busy || Boolean(row.editing);
  const viewButton = row.element.querySelector('[data-action="view"]');
  viewButton.hidden = !row.result;
  viewButton.disabled = locked;
  row.size.disabled = locked;
  row.draft.disabled = locked;
  row.refinement.disabled = locked || !row.result;
  row.element.querySelector('.result-refinement').hidden = !row.result;
  row.element.querySelector('[data-action="refine"]').disabled =
    locked || !configured || !row.resultData || !row.refinement.value.trim();
  row.element.querySelector('.refinement-counter').textContent =
    `${row.refinement.value.length} / 4000`;
  row.element.querySelectorAll('[data-action="upload"], [data-action="edit"]').forEach((button) => {
    button.disabled = locked;
  });
  row.element.querySelector('[data-action="analyze"]').disabled =
    locked || !configured || !row.image;
  row.element.querySelector('[data-action="improve"]').disabled =
    locked || !configured || !row.draft.value.trim();
  row.element.querySelector('[data-action="generate"]').disabled =
    locked || !configured || !row.image || !promptCurrent(row);
  row.element.querySelector('[data-action="copy"]').disabled = busy || !row.draft.value.trim();
  row.element.querySelector('[data-action="cancel"]').hidden = !busy;
  row.element.querySelector('.working-overlay').hidden = !['generate', 'refine'].includes(row.busy);
  row.element.querySelector('.working-overlay > span:last-child').textContent =
    row.busy === 'refine' ? 'Dein Bild wird angepasst …' : 'Dein Bild entsteht …';
  const status = row.element.querySelector('.row-status');
  if (row.editing) status.textContent = 'Bild wird bearbeitet';
  else if (row.busy === 'analyze') status.textContent = 'Bild wird analysiert';
  else if (row.busy === 'improve') status.textContent = 'Prompt wird verbessert';
  else if (row.busy === 'generate') status.textContent = 'Bild wird generiert';
  else if (row.busy === 'refine') status.textContent = 'Ergebnis wird angepasst';
  else if (row.draft.value.trim() && !promptCurrent(row)) status.textContent = 'Prompt prüfen';
  else if (row.result && row.resultPrompt === row.draft.value.trim() && promptCurrent(row))
    status.textContent = row.resultModified ? 'Produktbild angepasst' : 'Produktbild fertig';
  else if (row.draft.value.trim()) status.textContent = 'Prompt bereit zur Prüfung';
  else if (row.image) status.textContent = 'Bereit zur Analyse';
  else status.textContent = 'Bereit für dein Bild';
  row.element.setAttribute('aria-busy', String(busy));
  row.element.querySelector('.result-stale').hidden =
    !row.result || row.resultImageRevision === row.imageRevision;
}

async function editImage(row) {
  if (!row.image || row.busy || row.editing || uploading) return;
  row.editing = true;
  updateRow(row);
  try {
    const result = await imageEditor.open(row.sourceImage, row.edit);
    if (!result || !rows.has(row.id)) return;
    row.edit = result.edit;
    if (result.image === row.image) return;
    row.image = result.image;
    row.imageRevision++;
    row.element.querySelector('.original-image').src = result.image;
    row.element.querySelector('.image-dimensions').textContent =
      `${result.width} × ${result.height} px`;
    row.element.querySelector('.file-meta').textContent = `${(result.bytes / 1024 / 1024).toFixed(
      1,
    )} MB`;
    message(
      row,
      row.draft.value.trim()
        ? 'Bildbearbeitung übernommen. Bitte den Prompt prüfen und bearbeiten oder das Bild erneut analysieren. Bisherige Entwürfe und Ergebnisse bleiben erhalten.'
        : 'Bildbearbeitung übernommen. Dieses Bild wird bei der nächsten Analyse als Referenz verwendet.',
      'success',
    );
  } catch {
    message(
      row,
      'Die Bildbearbeitung konnte nicht geöffnet werden. Bitte das Bild erneut laden.',
      'error',
    );
  } finally {
    row.editing = false;
    if (rows.has(row.id)) {
      updateRow(row);
      row.element.querySelector('[data-action="edit"]').focus({preventScroll: true});
    }
  }
}

function updateCount() {
  const count = [...rows.values()].filter((row) => row.image).length;
  document.querySelector('#image-count').textContent = count
    ? `${count} ${count === 1 ? 'Bild' : 'Bilder'}`
    : 'Noch kein Bild';
  [...rows.values()].forEach((row, index) => {
    row.element.querySelector('.row-number').textContent = String(index + 1).padStart(2, '0');
  });
}

function resetResult(row) {
  if (viewedRow === row) resultViewer.close();
  if (row.result) URL.revokeObjectURL(row.result);
  if (row.downloadUrl) URL.revokeObjectURL(row.downloadUrl);
  row.result = null;
  row.downloadUrl = null;
  row.resultData = null;
  row.resultSize = null;
  row.resultModified = false;
  row.resultPrompt = '';
  row.element.querySelector('.result-image').hidden = true;
  row.element.querySelector('[data-action="view"]').hidden = true;
  row.element.querySelector('.result-image').removeAttribute('src');
  row.element.querySelector('.result-placeholder').hidden = false;
  row.element.querySelector('.result-caption').hidden = true;
  const download = row.element.querySelector('.button-download');
  download.hidden = true;
  download.removeAttribute('href');
}

function createRow() {
  const id = ++nextId;
  const element = document
    .querySelector('#image-row-template')
    .content.firstElementChild.cloneNode(true);
  const row = {
    id,
    element,
    image: null,
    sourceImage: null,
    imageRevision: 0,
    edit: null,
    editing: false,
    filename: '',
    promptContext: null,
    result: null,
    downloadUrl: null,
    resultData: null,
    resultSize: null,
    resultModified: false,
    busy: null,
    controller: null,
    timer: null,
  };
  row.draft = element.querySelector('.generation-prompt');
  row.size = element.querySelector('.output-size');
  row.refinement = element.querySelector('.refinement-prompt');
  row.draft.id = `draft-${id}`;
  row.size.id = `size-${id}`;
  row.refinement.id = `refinement-${id}`;
  element.querySelector('.generation-label').htmlFor = row.draft.id;
  element.querySelector('.format-label').htmlFor = row.size.id;
  element.querySelector('.refinement-label').htmlFor = row.refinement.id;
  row.refinement.addEventListener('input', () => updateRow(row));
  row.size.addEventListener('change', () => {
    if (row.draft.value.trim())
      message(
        row,
        'Das Ausgabeformat wurde geändert. Bitte den Prompt anpassen, verbessern oder das Bild erneut analysieren.',
      );
    updateRow(row);
  });
  row.draft.addEventListener('input', () => {
    row.promptContext = {size: row.size.value, imageRevision: row.imageRevision};
    message(row, 'Dein bearbeiteter Prompt wird beim Klick auf „Bild generieren“ verwendet.');
    updateRow(row);
  });
  element.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    const action = button.dataset.action;
    if (action === 'upload') {
      uploadTarget = id;
      fileInput.click();
    } else if (action === 'edit') await editImage(row);
    else if (action === 'view') viewResult(row);
    else if (['analyze', 'improve', 'generate', 'refine'].includes(action))
      await processRow(row, action);
    else if (action === 'cancel') row.controller?.abort();
    else if (action === 'remove') {
      row.controller?.abort();
      clearInterval(row.timer);
      resetResult(row);
      rows.delete(id);
      element.remove();
      if (!rows.size) createRow();
      updateCount();
    } else if (action === 'copy') {
      try {
        await navigator.clipboard.writeText(row.draft.value);
        message(row, 'Bildprompt kopiert.', 'success');
      } catch {
        row.draft.focus();
        row.draft.select();
        message(row, 'Bitte den markierten Prompt mit Strg+C kopieren.');
      }
    }
  });
  rows.set(id, row);
  rowsContainer.append(element);
  updateCount();
  updateRow(row);
  return row;
}

function readFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Die Datei konnte nicht gelesen werden.'));
    reader.readAsDataURL(file);
  });
}

async function addFiles(files, targetId = null) {
  if (uploading) return;
  uploading = true;
  document.querySelectorAll('[data-add-images]').forEach((button) => {
    button.disabled = true;
  });
  const failures = [];
  let target = rows.get(targetId);
  try {
    for (const file of files) {
      try {
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type))
          throw new Error('Bitte JPG, PNG oder WebP verwenden.');
        if (file.size > 10 * 1024 * 1024) throw new Error('Das Bild ist größer als 10 MB.');
        if ([...rows.values()].filter((row) => row.image).length >= 20 && !target?.image)
          throw new Error('Maximal 20 Bilder pro Sitzung. Entferne zuerst eine andere Zeile.');
        const bitmap = await createImageBitmap(file);
        const width = bitmap.width;
        const height = bitmap.height;
        bitmap.close();
        if (!width || !height || width * height > 40_000_000)
          throw new Error('Bitte ein Bild mit höchstens 40 Megapixeln verwenden.');
        const image = await readFile(file);
        let row =
          target && rows.has(target.id)
            ? target
            : [...rows.values()].find((item) => !item.image && !item.busy);
        if (!row) row = createRow();
        target = null;
        if (row.busy || row.editing) throw new Error('Diese Zeile wird gerade verarbeitet.');
        const replacingImage = Boolean(row.image);
        row.image = image;
        row.sourceImage = image;
        row.edit = null;
        row.imageRevision++;
        row.filename = file.name;
        row.promptContext =
          !replacingImage && row.draft.value.trim()
            ? {size: row.size.value, imageRevision: row.imageRevision}
            : null;
        if (replacingImage) row.draft.value = '';
        row.refinement.value = '';
        resetResult(row);
        row.element.querySelector('.row-filename').textContent = file.name;
        row.element.querySelector('.file-meta').textContent = `${(file.size / 1024 / 1024).toFixed(
          1,
        )} MB`;
        row.element.querySelector('.image-dimensions').textContent = `${width} × ${height} px`;
        row.element.querySelector('.upload-zone').hidden = true;
        row.element.querySelector('.original-preview').hidden = false;
        const original = row.element.querySelector('.original-image');
        original.src = image;
        original.alt = `Originalbild: ${file.name}`;
        row.element.setAttribute('aria-label', `Bildbearbeitung: ${file.name}`);
        message(
          row,
          'Bild bereit. Starte die Analyse oder gib deinen Produktbild-Prompt direkt ein.',
        );
        updateRow(row);
        updateCount();
      } catch (error) {
        failures.push(
          `${file.name}: ${error.message || 'Dieses Bild konnte nicht geladen werden.'}`,
        );
      }
    }
  } finally {
    uploading = false;
    document.querySelectorAll('[data-add-images]').forEach((button) => {
      button.disabled = false;
    });
    uploadError.hidden = failures.length === 0;
    uploadError.textContent = failures.join(' ');
    fileInput.value = '';
    uploadTarget = null;
  }
}

async function callApi(action, body, signal) {
  try {
    return await openAI[action](body, signal);
  } catch (error) {
    if (error instanceof StudioError && !error.cost)
      error.cost = {status: 'not_requested', usd: 0, eur: 0};
    throw error;
  }
}

async function createJpegDownload(blob) {
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  try {
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext('2d');
    // JPEG has no alpha channel: flatten transparent pixels onto white.
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0);
    const jpeg = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.95));
    if (!jpeg || jpeg.type !== 'image/jpeg') throw new Error('JPEG export unavailable');
    return jpeg;
  } finally {
    bitmap.close();
    canvas.width = canvas.height = 1;
  }
}

async function processRow(row, action) {
  if (row.busy || row.editing || !configured) return;
  if ([...rows.values()].filter((item) => item.busy).length >= 3) {
    message(row, 'Drei Anfragen werden bereits verarbeitet. Bitte kurz warten.');
    return;
  }
  const refining = action === 'refine';
  if (refining && (!row.resultData || !row.refinement.value.trim())) return;
  if (action === 'analyze' && !row.image) return;
  if (action === 'improve' && !row.draft.value.trim()) return;
  if (action === 'generate' && (!row.image || !promptCurrent(row))) return;
  const prompt = refining ? row.refinement.value.trim() : row.draft.value.trim();
  const size = refining ? row.resultSize : row.size.value;
  const image = refining ? row.resultData : row.image;
  const basePrompt = refining ? row.resultPrompt : prompt;
  const imageRevision = refining ? row.resultImageRevision : row.imageRevision;
  row.controller = new AbortController();
  row.busy = action;
  const costEntry = {
    rowId: row.id,
    filename: row.filename || 'Eigener Prompt',
    action,
    time: new Date().toLocaleTimeString('de-DE'),
    cost: {status: 'pending'},
  };
  costHistory.push(costEntry);
  renderCosts();
  const start = Date.now();
  row.timer = setInterval(() => {
    row.element.querySelector('.elapsed').textContent = `${Math.floor(
      (Date.now() - start) / 1000,
    )} s`;
  }, 1000);
  message(
    row,
    action === 'analyze'
      ? 'OpenAI analysiert das Original und formuliert deinen Produktbild-Prompt.'
      : action === 'improve'
        ? 'OpenAI verbessert deinen vorhandenen Text zu einem präziseren Produktbild-Prompt. Dein Bild wird dabei nicht übertragen.'
        : refining
          ? 'Dein Änderungswunsch und das aktuelle Ergebnisbild werden verarbeitet. Das bisherige Bild bleibt bis zum Abschluss verfügbar.'
          : 'Dein geprüfter Prompt und das Original werden verarbeitet. Das kann einige Minuten dauern.',
  );
  updateRow(row);
  try {
    const data = await callApi(
      refining ? 'generate' : action,
      action === 'improve'
        ? {prompt, size}
        : action === 'analyze'
          ? {image, size}
          : {image, prompt, size},
      row.controller.signal,
    );
    costEntry.cost = data.cost || {status: 'unavailable', reason: 'usage_missing'};
    renderCosts();
    if (!rows.has(row.id)) return;
    if (action === 'analyze' || action === 'improve') {
      if (typeof data.prompt !== 'string' || !data.prompt.trim())
        throw new Error('Es wurde kein Bildprompt geliefert.');
      row.promptContext = {size, imageRevision: row.imageRevision};
      row.draft.value = data.prompt;
      message(
        row,
        action === 'improve'
          ? 'Prompt verbessert. Prüfe den Text vor der Bildgenerierung.'
          : 'Prompt fertig. Prüfe und bearbeite ihn. Erst „Bild generieren“ erstellt dein neues Produktbild.',
        'success',
      );
    } else {
      if (
        typeof data.image !== 'string' ||
        !data.image.startsWith('data:image/png;base64,') ||
        !['1024x768', '1024x1024', '768x1024'].includes(data.size)
      )
        throw new Error('Es wurde kein verwendbares Bild geliefert.');
      const bytes = Uint8Array.from(atob(data.image.split(',')[1]), (character) =>
        character.charCodeAt(0),
      );
      const blob = new Blob([bytes], {type: 'image/png'});
      let jpeg;
      try {
        jpeg = await createJpegDownload(blob);
      } catch {
        throw new Error(
          'Das gelieferte Bild konnte nicht als JPG vorbereitet werden. Dein bisheriges Ergebnis bleibt erhalten.',
        );
      }
      if (!rows.has(row.id)) return;
      if (row.controller.signal.aborted)
        throw new DOMException('Anfrage abgebrochen.', 'AbortError');
      const resultUrl = URL.createObjectURL(blob);
      let downloadUrl;
      try {
        downloadUrl = URL.createObjectURL(jpeg);
      } catch (error) {
        URL.revokeObjectURL(resultUrl);
        throw error;
      }
      resetResult(row);
      row.result = resultUrl;
      row.downloadUrl = downloadUrl;
      row.resultData = data.image;
      row.resultSize = data.size;
      row.resultPrompt = basePrompt;
      row.resultImageRevision = imageRevision;
      row.resultModified = refining;
      row.refinement.value = '';
      const result = row.element.querySelector('.result-image');
      result.src = row.result;
      result.alt = `Generiertes Produktbild für ${row.filename}`;
      result.hidden = false;
      row.element.querySelector('.result-placeholder').hidden = true;
      row.element.querySelector('.result-caption').hidden = false;
      row.element.querySelector('.result-size').textContent = data.size.replace('x', ' × ') + ' px';
      const download = row.element.querySelector('.button-download');
      download.href = row.downloadUrl;
      download.download =
        row.filename
          .replace(/\.[^.]+$/, '')
          .replace(/[^\p{L}\p{N}._-]+/gu, '-')
          .slice(0, 80) + '-produkt.jpg';
      download.hidden = false;
      message(
        row,
        refining
          ? 'Dein Bild wurde angepasst. Du kannst es herunterladen oder mit einem weiteren Änderungswunsch verfeinern.'
          : 'Dein Produktbild ist fertig. Prüfe die Details und lade es herunter.',
        'success',
      );
    }
  } catch (error) {
    if (costEntry.cost.status === 'pending')
      costEntry.cost = error.cost || {status: 'unavailable', reason: 'usage_missing'};
    renderCosts();
    const cancelled = error.name === 'AbortError' || error.status === 499;
    if (rows.has(row.id))
      message(
        row,
        cancelled
          ? 'Anfrage abgebrochen. Du kannst den Schritt erneut starten.'
          : error.message || 'Die Anfrage ist fehlgeschlagen.',
        cancelled ? '' : 'error',
      );
  } finally {
    clearInterval(row.timer);
    row.busy = null;
    row.controller = null;
    row.element.querySelector('.elapsed').textContent = '';
    if (rows.has(row.id)) updateRow(row);
  }
}

document.querySelectorAll('[data-add-images]').forEach((button) =>
  button.addEventListener('click', () => {
    uploadTarget = null;
    fileInput.click();
  }),
);
fileInput.addEventListener('change', () => addFiles([...fileInput.files], uploadTarget));
let dragDepth = 0;
const dropOverlay = document.querySelector('#drop-overlay');
document.addEventListener('dragenter', (event) => {
  if (!event.dataTransfer?.types.includes('Files')) return;
  event.preventDefault();
  if (document.querySelector('dialog[open]')) return;
  dragDepth++;
  dropOverlay.hidden = false;
});
document.addEventListener('dragover', (event) => {
  if (event.dataTransfer?.types.includes('Files')) event.preventDefault();
});
document.addEventListener('dragleave', () => {
  dragDepth = Math.max(0, dragDepth - 1);
  if (!dragDepth) dropOverlay.hidden = true;
});
document.addEventListener('drop', (event) => {
  if (!event.dataTransfer?.types.includes('Files')) return;
  event.preventDefault();
  dragDepth = 0;
  dropOverlay.hidden = true;
  if (document.querySelector('dialog[open]')) return;
  const element = event.target.closest('.image-row');
  const target = [...rows.values()].find((row) => row.element === element && !row.busy);
  addFiles([...event.dataTransfer.files], target?.id);
});
window.addEventListener('blur', () => {
  dragDepth = 0;
  dropOverlay.hidden = true;
});

createRow();
updateKeyState();
if (!configured) apiSettings.open = true;

window.addEventListener('beforeunload', (event) => {
  if ([...rows.values()].some((row) => row.image || row.draft.value || row.refinement.value)) {
    event.preventDefault();
    event.returnValue = '';
  }
});
