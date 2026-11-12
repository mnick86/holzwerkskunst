import {
  createGitHubClient,
  GitHubError,
  TOKEN_STORAGE,
  SESSION_STORAGE,
  nextFilename,
  pullRequestUrl,
  actionsUrl,
  branchName,
  compareCatalogImages,
  validateProductTags,
} from './github.mjs';
import {StudioError} from './openai.mjs';

export function initGitHubUI({getRows, onRowUpdate, describeImage}) {
  const $ = (id) => document.getElementById(id);
  let token = '';
  let savedSession = null;
  let selected = '';
  let pendingUpload = null;
  let catalogLoading = false;
  let catalogError = '';
  let descriptionRequest = null;
  let galleryController = null;
  let galleryKey = '';
  let categoryOptionsKey = '';
  let branchOptionsKey = '';
  const previewUrls = new Set();
  const message = (text, error = false) => {
    $('github-message').textContent = text;
    $('github-message').dataset.tone = error ? 'error' : '';
  };
  try {
    const candidate = localStorage.getItem(TOKEN_STORAGE)?.trim() || '';
    if (/^[\x21-\x7e]{1,4096}$/.test(candidate)) token = candidate;
    const stored = localStorage.getItem(SESSION_STORAGE);
    if (stored) savedSession = JSON.parse(stored);
  } catch {
    message(
      'Gespeicherte GitHub-Einstellungen konnten nicht gelesen werden. Bitte Token und Sitzung prüfen.',
      true,
    );
  }
  const service = createGitHubClient({
    getToken: () => token,
    onChange(state) {
      if (state.session || (state.connected && !state.busy)) {
        savedSession = state.session;
        try {
          if (savedSession) localStorage.setItem(SESSION_STORAGE, JSON.stringify(savedSession));
          else localStorage.removeItem(SESSION_STORAGE);
        } catch {
          message(
            'Die PR-Sitzung konnte nicht lokal gespeichert werden. Bereits hochgeladene Dateien bleiben auf GitHub erhalten.',
            true,
          );
        }
      }
      render(state);
    },
  });
  const active = (state) =>
    state.connected && state.session && !state.session.merged && !state.session.closed;
  const node = (tag, value, className) => {
    const element = document.createElement(tag);
    if (value) element.textContent = value;
    if (className) element.className = className;
    return element;
  };
  function clearGallery() {
    galleryController?.abort();
    galleryController = null;
    galleryKey = '';
    for (const url of previewUrls) URL.revokeObjectURL(url);
    previewUrls.clear();
    $('github-image-previews').replaceChildren();
  }
  async function thumbnail(blob, signal) {
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement('canvas');
    try {
      signal.throwIfAborted();
      const scale = Math.min(240 / bitmap.width, 180 / bitmap.height, 1);
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext('2d');
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const result = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.8));
      signal.throwIfAborted();
      if (!result) throw new Error('Thumbnail unavailable');
      return result;
    } finally {
      bitmap.close();
      canvas.width = canvas.height = 1;
    }
  }
  function productFolders(state) {
    const products = new Map(state.products.map((p) => [p.folder, p]));
    const folders = new Set([
      ...state.paths
        .filter((path) => /^products\/[^/]+\/spec\.yaml$/.test(path))
        .map((path) => path.split('/')[1]),
      ...state.products.filter((p) => p.pending).map((p) => p.folder),
    ]);
    return [...folders]
      .sort((a, b) => a.localeCompare(b, 'de'))
      .map((folder) => products.get(folder) || {folder});
  }
  function renderCategories(state) {
    const select = $('github-product-select');
    const products = productFolders(state);
    const optionsKey = JSON.stringify(products.map((p) => [p.folder, p.name, p.pending]));
    if (optionsKey !== categoryOptionsKey) {
      categoryOptionsKey = optionsKey;
      const empty = node('option', 'Kategorie / Produktordner auswählen');
      empty.value = '';
      select.replaceChildren(
        empty,
        ...products.map((product) => {
          const option = node(
            'option',
            `${product.folder}${product.pending ? ' · neu' : ''}${
              product.name ? ` – ${product.name}` : ''
            }`,
          );
          option.value = product.folder;
          return option;
        }),
      );
    }
    select.value = selected;
    select.disabled =
      !state.connected || state.busy || catalogLoading || Boolean(descriptionRequest);
    if (!$('github-image-dialog').open || !state.connected) {
      clearGallery();
      return;
    }
    if (!selected) {
      clearGallery();
      $('github-gallery-note').textContent =
        'Wähle eine Kategorie aus, um die vorhandenen Bilder zu laden.';
      return;
    }
    if (catalogLoading || catalogError || state.catalogBranch !== pendingUpload?.branch) {
      clearGallery();
      $('github-gallery-note').textContent =
        catalogError || `Bilder aus Branch ${pendingUpload?.branch || ''} werden geladen …`;
      return;
    }
    const images = state.imageFiles
      .filter((image) => image.path.startsWith(`products/${selected}/`))
      .sort((a, b) => compareCatalogImages(a.path, b.path));
    $('github-gallery-note').textContent = selected
      ? images.length
        ? `${images.length} Bilder · Branch: ${state.catalogBranch} · Reihenfolge wie auf der Website. Das erste Bild ist das Titelbild.`
        : 'Noch keine Bilder in dieser Kategorie.'
      : 'Wähle eine Kategorie aus, um die vorhandenen Bilder zu sehen.';
    const key = JSON.stringify([
      state.catalogBranch,
      state.catalogHead,
      selected,
      images.map((image) => [image.path, image.sha]),
    ]);
    if (key === galleryKey) return;
    clearGallery();
    galleryKey = key;
    const controller = new AbortController();
    galleryController = controller;
    const gallery = $('github-image-previews');
    const cards = images.map((image, index) => {
      const figure = node('figure', '', 'github-image-preview');
      const frame = node('div', '', 'github-preview-frame');
      const preview = node('img');
      const filename = image.path.split('/').at(-1);
      preview.alt = `Vorschau: ${filename}`;
      preview.hidden = true;
      preview.decoding = 'async';
      const status = node('span', 'Wird geladen …');
      frame.append(preview, status);
      figure.append(frame, node('figcaption', filename));
      if (!index) figure.append(node('small', 'Titelbild'));
      gallery.append(figure);
      return {image, preview, status};
    });
    if (!images.length && selected)
      gallery.append(
        node('p', 'In diesem Produktordner sind noch keine Bilder vorhanden.', 'small-note'),
      );
    let cursor = 0;
    async function loadNext() {
      while (cursor < cards.length && !controller.signal.aborted) {
        const {image, preview, status} = cards[cursor++];
        try {
          const source = await service.readImage(image.path, controller.signal, image.sha);
          const blob = await thumbnail(source, controller.signal);
          controller.signal.throwIfAborted();
          const url = URL.createObjectURL(blob);
          previewUrls.add(url);
          preview.addEventListener(
            'error',
            () => {
              preview.hidden = true;
              status.hidden = false;
              status.textContent = 'Vorschau nicht verfügbar';
            },
            {once: true},
          );
          preview.src = url;
          preview.hidden = false;
          status.hidden = true;
        } catch {
          if (!controller.signal.aborted) status.textContent = 'Vorschau nicht verfügbar';
        }
      }
    }
    for (let index = 0; index < Math.min(3, cards.length); index++) void loadNext();
  }
  function descriptionDraft(row) {
    row.githubDescriptions ||= new Map();
    const key = row.result;
    if (!row.githubDescriptions.has(key)) row.githubDescriptions.set(key, {text: ''});
    return row.githubDescriptions.get(key);
  }
  function selectFolder(product, state = service.getState()) {
    selected = product?.folder || '';
    if (!pendingUpload) return;
    pendingUpload.folder = selected;
    pendingUpload.product = product;
    if (selected) pendingUpload.row.githubFolder = selected;
    const field = $('github-image-name');
    const suggestion = selected ? nextFilename(state.paths, selected) : '';
    if (!field.value || field.value === pendingUpload.suggestedFilename) field.value = suggestion;
    pendingUpload.suggestedFilename = suggestion;
  }
  function rowState(row, state = service.getState()) {
    const [width, height] = (row.resultSize || '').split('x').map(Number);
    const catalogSize = width > 0 && height > 0 && Math.abs(width / height - 4 / 3) < 0.01;
    const folder = state.products.find((p) => p.folder === row.githubFolder);
    const target = row.element.querySelector('.github-target');
    const button = row.element.querySelector('.github-add');
    if (!target || !button) return;
    target.textContent = folder
      ? `GitHub-Ziel: ${state.session?.branch || 'kein Branch gewählt'} · products/${
          folder.folder
        }/`
      : 'Produktordner im Dialog auswählen.';
    button.disabled =
      !active(state) ||
      state.busy ||
      row.busy ||
      row.editing ||
      row.githubBusy ||
      !row.resultJpeg ||
      !catalogSize ||
      row.resultImageRevision !== row.imageRevision;
    const added = row.githubUploads?.findLast(
      (item) => item.version === row.result && item.branch === state.session?.branch,
    );
    row.element.querySelector('.github-row-status').textContent = row.githubBusy
      ? 'Bild wird zum PR hinzugefügt …'
      : added
        ? `Im PR: ${added.path}`
        : row.resultJpeg && !catalogSize
          ? 'Für den Produktkatalog ein Bild im 4:3-Format verwenden.'
          : '';
  }
  function workflowText(run, label) {
    if (!run) return '';
    if (run.status === 'unavailable')
      return `${label}: nicht abrufbar. Actions-Leserechte und Workflow prüfen.`;
    if (run.status === 'waiting')
      return `${label}: wartet auf GitHub. Den aktuellen Stand findest du über den Deployment-Link.`;
    if (run.status !== 'completed')
      return `${label}: läuft oder ist vorgemerkt. Den aktuellen Stand findest du über den Deployment-Link.`;
    return `${label}: ${
      run.conclusion === 'success' ? 'erfolgreich' : run.conclusion || 'nicht erfolgreich'
    }.`;
  }
  function mergeBlocker(state) {
    if (state.busy) return 'Bitte die laufende GitHub-Aktion abwarten.';
    if (!state.connected) return 'Zum Mergen zuerst mit GitHub verbinden.';
    if (!state.session) return 'Zuerst einen Branch auswählen oder erstellen.';
    if (state.session.merged) return 'Dieser Branch wurde bereits nach main gemergt.';
    if (state.session.closed) return 'Der zugehörige Pull Request wurde geschlossen.';
    if (!state.files.length && !state.aheadBy)
      return 'Dieser Branch enthält noch keine Änderungen gegenüber main. Du kannst ein Produktbild hinzufügen.';
    if (state.session.drafts.length)
      return 'Vorbereitete Produkte brauchen noch ein Bild. Bitte ein Bild hinzufügen oder den Entwurf verwerfen.';
    return '';
  }
  function render(state = service.getState()) {
    const open = active(state);
    $('github-token-state').textContent = token ? 'Im Browser gespeichert' : 'Nicht gespeichert';
    $('github-token-delete').disabled = !token;
    const connectButton = $('github-connect');
    connectButton.disabled = !token || state.busy;
    connectButton.textContent = state.connected ? 'Mit GitHub verbunden' : 'Mit GitHub verbinden';
    connectButton.classList.toggle('button-primary', state.connected);
    connectButton.classList.toggle('button-secondary', !state.connected);
    $('github-new-pr').disabled = !state.connected || state.busy;
    $('github-refresh').disabled = !state.connected || state.busy || Boolean(pendingUpload);
    $('github-new-product').disabled = !open || state.busy;
    const branchSelect = $('github-branch');
    const optionsKey = JSON.stringify([state.connected, state.branches]);
    if (optionsKey !== branchOptionsKey) {
      branchOptionsKey = optionsKey;
      const placeholder = node(
        'option',
        !state.connected
          ? 'Mit GitHub verbinden, um Branches zu laden'
          : state.branches.length
            ? 'Branch auswählen'
            : 'Keine Branches vorhanden – einen neuen erstellen',
      );
      placeholder.value = '';
      placeholder.disabled = true;
      branchSelect.replaceChildren(
        placeholder,
        ...state.branches.map((branch) => {
          const option = node('option', branch);
          option.value = branch;
          return option;
        }),
      );
    }
    branchSelect.value =
      open && state.branches.includes(state.session.branch) ? state.session.branch : '';
    branchSelect.disabled = !state.connected || state.busy || Boolean(pendingUpload);
    $('github-branch-note').textContent = open
      ? `Uploads gehen nach ${state.session.branch}. „Branch mergen“ übernimmt alle Änderungen dieses Branches nach main.`
      : 'Wähle einen vorhandenen Branch oder erstelle einen neuen. main und gh-pages sind ausgenommen.';
    const blocker = mergeBlocker(state);
    $('github-publish').disabled = Boolean(blocker);
    $('github-publish').title = blocker;
    const commits = open ? state.aheadBy : 0;
    $('github-publish').textContent = `Branch mergen · ${commits} ${
      commits === 1 ? 'Commit' : 'Commits'
    }`;
    $('github-deploy-state').textContent = workflowText(state.deployment, 'Deployment');
    const prLink = $('github-pr-link');
    prLink.hidden = !state.session?.pullNumber;
    if (!prLink.hidden) prLink.href = pullRequestUrl(state.session.pullNumber);
    const runLink = $('github-run-link');
    runLink.hidden = !state.session?.merged;
    if (!runLink.hidden) runLink.href = state.deployment?.url || actionsUrl;
    $('github-changes').replaceChildren(
      ...state.files.map((file) =>
        node(
          'li',
          `${
            {added: 'Neu', modified: 'Geändert', removed: 'Gelöscht', renamed: 'Umbenannt'}[
              file.status
            ] || file.status
          }: ${file.filename}`,
        ),
      ),
    );
    if (selected && !productFolders(state).some((p) => p.folder === selected)) selected = '';
    if (pendingUpload && pendingUpload.folder !== selected)
      selectFolder(
        state.products.find((p) => p.folder === selected),
        state,
      );
    $('github-image-target').textContent = selected
      ? `Ziel: ${state.session?.branch || 'kein Branch gewählt'} · products/${selected}/`
      : 'Bitte einen Produktordner wählen oder ein neues Produkt erstellen.';
    renderCategories(state);
    $('github-folder-note').textContent = state.connected
      ? `${productFolders(state).length} Produkte · Branch: ${state.session?.branch || state.base}`
      : 'Verbinde GitHub, um deine Produkte zu laden.';
    $('github-discard-product').hidden = !state.products.some(
      (p) => p.folder === selected && p.pending,
    );
    $('github-discard-product').disabled = state.busy;
    for (const row of getRows()) rowState(row, state);
    document.querySelectorAll('.github-dialog button').forEach((button) => {
      button.disabled =
        state.busy ||
        ((Boolean(descriptionRequest) || catalogLoading || Boolean(catalogError)) &&
          !button.hasAttribute('data-github-close'));
    });
    const needsFolder = !selected || !pendingUpload?.product?.name;
    if (needsFolder) {
      $('github-description-retry').disabled = true;
      $('github-image-form').querySelector('[type="submit"]').disabled = true;
    }
  }
  async function generateDescription(upload) {
    if (!upload?.folder || !upload.product?.name || descriptionRequest) return;
    const controller = new AbortController();
    const request = {upload, controller};
    descriptionRequest = request;
    const field = $('github-image-description');
    const previous = field.value;
    field.readOnly = true;
    $('github-description-state').textContent = 'OpenAI erstellt die Bildbeschreibung …';
    $('github-image-dialog').querySelector('.github-dialog-error').textContent = '';
    render();
    try {
      const description = await describeImage(
        upload.row,
        upload.product || {name: 'Holzprodukt', description: ''},
        controller.signal,
      );
      if (controller.signal.aborted || pendingUpload !== upload || !upload.row.element.isConnected)
        return;
      upload.draft.text = description;
      field.value = description;
      $('github-description-state').textContent =
        'KI-Entwurf fertig. Bitte prüfen und bei Bedarf bearbeiten.';
    } catch (error) {
      if (controller.signal.aborted || pendingUpload !== upload) return;
      field.value = previous;
      $('github-description-state').textContent =
        'Vorhandener Text bleibt erhalten. Erneut versuchen oder selbst ausfüllen.';
      $('github-image-dialog').querySelector('.github-dialog-error').textContent =
        error instanceof StudioError
          ? error.message
          : 'Die Bildbeschreibung konnte nicht erstellt werden.';
    } finally {
      if (descriptionRequest === request) {
        descriptionRequest = null;
        field.readOnly = false;
        render();
      }
    }
  }
  async function perform(action, dialog) {
    try {
      message('');
      if (dialog) dialog.querySelector('.github-dialog-error').textContent = '';
      await action();
      return true;
    } catch (error) {
      const value =
        error instanceof GitHubError
          ? error.message
          : 'Die Aktion konnte nicht abgeschlossen werden. Bitte erneut mit GitHub verbinden.';
      if (dialog) dialog.querySelector('.github-dialog-error').textContent = value;
      else message(value, true);
      return false;
    }
  }
  $('github-token-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const input = $('github-token');
    const value = input.value.trim();
    if (!/^[\x21-\x7e]{1,4096}$/.test(value)) {
      message('Bitte einen GitHub-Token ohne Leerzeichen oder Zeilenumbrüche eingeben.', true);
      return;
    }
    try {
      localStorage.setItem(TOKEN_STORAGE, value);
    } catch {
      message('Der Token konnte nicht im Local Storage gespeichert werden.', true);
      return;
    }
    service.disconnect();
    token = value;
    input.value = '';
    render();
    message('Token gespeichert. Klicke auf „Mit GitHub verbinden“, um den Zugriff zu prüfen.');
  });
  $('github-token-delete').addEventListener('click', () => {
    try {
      localStorage.removeItem(TOKEN_STORAGE);
    } catch {
      message('Der gespeicherte Token konnte nicht gelöscht werden.', true);
      return;
    }
    service.disconnect();
    token = '';
    $('github-token').value = '';
    render();
    message('GitHub-Token gelöscht. PRs und Dateien auf GitHub bleiben erhalten.');
  });
  $('github-connect').addEventListener('click', () => perform(() => service.connect(savedSession)));
  $('github-refresh').addEventListener('click', () =>
    perform(async () => {
      await service.refresh();
      message('Branch-Stand aktualisiert.');
    }),
  );
  $('github-branch').addEventListener('change', () =>
    perform(() => service.selectBranch($('github-branch').value)),
  );
  $('github-publish').addEventListener('click', () =>
    perform(async () => {
      const result = await service.publish();
      message(
        result.deletionWarning ||
          'Branch nach main gemergt und gelöscht. GitHub startet das Deployment. Den aktuellen Stand findest du über den Deployment-Link.',
        Boolean(result.deletionWarning),
      );
    }),
  );
  $('github-product-select').addEventListener('change', async () => {
    const upload = pendingUpload;
    if (!upload || service.getState().busy || descriptionRequest) return;
    const folder = $('github-product-select').value;
    catalogError = '';
    selectFolder(folder ? {folder} : null);
    if (!folder) {
      render();
      return;
    }
    catalogLoading = true;
    render();
    const dialog = $('github-image-dialog');
    const loaded = await perform(async () => {
      await service.refresh({loadProducts: folder});
      const updated = service.getState();
      if (!active(updated) || updated.catalogBranch !== upload.branch)
        throw new GitHubError('Dieser Branch ist nicht mehr für Uploads verfügbar.');
      if (!updated.products.some((p) => p.folder === folder))
        throw new GitHubError('Dieser Produktordner ist im gewählten Branch nicht mehr vorhanden.');
    }, dialog);
    if (pendingUpload !== upload || !dialog.open) return;
    catalogLoading = false;
    catalogError = loaded
      ? ''
      : 'Die Produktdaten konnten nicht geladen werden. Bitte den Produktordner erneut auswählen.';
    const updated = service.getState();
    selectFolder(
      updated.products.find((p) => p.folder === folder),
      updated,
    );
    render(updated);
    if (loaded && !upload.draft.text.trim()) generateDescription(upload);
  });
  $('github-discard-product').addEventListener('click', () =>
    perform(async () => service.discardProduct(selected)),
  );
  for (const dialog of document.querySelectorAll('.github-dialog')) {
    dialog.querySelector('[data-github-close]').addEventListener('click', () => dialog.close());
    dialog.addEventListener('cancel', (event) => {
      if (service.getState().busy) event.preventDefault();
    });
  }
  $('github-image-dialog').addEventListener('close', () => {
    if ($('github-image-dialog').open) return;
    descriptionRequest?.controller.abort();
    descriptionRequest = null;
    pendingUpload = null;
    selected = '';
    catalogLoading = false;
    catalogError = '';
    $('github-image-description').readOnly = false;
    render();
  });
  $('github-description-retry').addEventListener('click', () => generateDescription(pendingUpload));
  $('github-image-description').addEventListener('input', () => {
    if (!pendingUpload) return;
    pendingUpload.draft.text = $('github-image-description').value;
    rowState(pendingUpload.row);
  });
  function open(dialog) {
    dialog.querySelector('.github-dialog-error').textContent = '';
    dialog.showModal();
    if (dialog.id === 'github-image-dialog') render();
  }
  $('github-new-pr').addEventListener('click', () => {
    $('github-pr-title').value = 'Neue Produktbilder';
    $('github-pr-branch').textContent = branchName($('github-pr-title').value);
    open($('github-pr-dialog'));
  });
  $('github-pr-title').addEventListener('input', () => {
    $('github-pr-branch').textContent = branchName($('github-pr-title').value);
  });
  $('github-pr-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const dialog = $('github-pr-dialog');
    if (await perform(() => service.start($('github-pr-title').value), dialog)) dialog.close();
  });
  function existingTags() {
    return [
      ...new Set(
        service
          .getState()
          .products.filter((p) => !p.pending)
          .flatMap((p) => p.tags),
      ),
    ].sort((a, b) => a.localeCompare(b, 'de'));
  }
  function updateProductTagValidity() {
    const field = $('github-product-tags');
    let error = '';
    try {
      validateProductTags(field.value, existingTags());
    } catch (validationError) {
      error = validationError.message;
    }
    field.setCustomValidity(error);
    field.setAttribute('aria-invalid', String(Boolean(error)));
    $('github-product-tags-error').textContent = error;
    return !error;
  }
  $('github-product-tags').addEventListener('input', updateProductTagValidity);
  $('github-product-tags').addEventListener('blur', updateProductTagValidity);
  $('github-new-product').addEventListener('click', async () => {
    const upload = pendingUpload;
    if (!upload || service.getState().busy) return;
    // New products need the complete set of existing IDs and allowed tags.
    const loaded = await perform(
      () => service.refresh({loadProducts: true}),
      $('github-image-dialog'),
    );
    if (!loaded || pendingUpload !== upload) return;
    $('github-product-form').reset();
    delete $('github-product-id').dataset.manual;
    $('github-product-date').value = new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'Europe/Berlin',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
    const tags = existingTags();
    $('github-product-tags').value = tags.includes('Geschenk') ? 'Geschenk' : '';
    $('github-tags-hint').textContent = `Vorhandene Kategorien: ${tags.join(', ')}`;
    updateProductTagValidity();
    open($('github-product-dialog'));
  });
  $('github-product-id').addEventListener('input', () => {
    $('github-product-id').dataset.manual = 'true';
  });
  $('github-product-name').addEventListener('input', () => {
    if (!$('github-product-id').dataset.manual)
      $('github-product-id').value = $('github-product-name')
        .value.toLowerCase()
        .replaceAll('ä', 'ae')
        .replaceAll('ö', 'oe')
        .replaceAll('ü', 'ue')
        .replaceAll('ß', 'ss')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 80);
  });
  $('github-product-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!updateProductTagValidity()) {
      $('github-product-tags').reportValidity();
      return;
    }
    const dialog = $('github-product-dialog');
    if (
      await perform(async () => {
        const input = Object.fromEntries(new FormData(event.target));
        const folder = service.addProduct(input);
        selectFolder(service.getState().products.find((product) => product.folder === folder));
        render();
      }, dialog)
    ) {
      dialog.close();
      if (pendingUpload && !pendingUpload.draft.text.trim()) generateDescription(pendingUpload);
      message(
        'Produkt vorbereitet. Produktdaten und erstes Bild werden beim Bestätigen gemeinsam übertragen.',
      );
    }
  });
  $('github-image-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const dialog = $('github-image-dialog');
    const upload = pendingUpload;
    if (descriptionRequest || catalogLoading || catalogError || service.getState().busy) return;
    if (upload && upload.branch !== service.getState().session?.branch) {
      dialog.querySelector('.github-dialog-error').textContent =
        'Der gewählte Branch wurde geändert. Bitte den Dialog erneut öffnen.';
      return;
    }
    if (!upload?.folder || !service.getState().products.some((p) => p.folder === upload.folder)) {
      dialog.querySelector('.github-dialog-error').textContent =
        'Bitte einen Produktordner auswählen.';
      return;
    }
    if (!upload || upload.row.result !== upload.version || upload.row.resultJpeg !== upload.blob) {
      dialog.querySelector('.github-dialog-error').textContent =
        'Das Ergebnis wurde geändert. Bitte den Dialog neu öffnen.';
      return;
    }
    if (!$('github-image-description').value.trim()) {
      dialog.querySelector('.github-dialog-error').textContent =
        'Bitte die Bildbeschreibung ausfüllen.';
      return;
    }
    const row = upload.row;
    row.githubBusy = true;
    onRowUpdate(row);
    try {
      if (
        await perform(async () => {
          const path = await service.addImage({
            folder: upload.folder,
            filename: $('github-image-name').value,
            blob: upload.blob,
            description: $('github-image-description').value,
          });
          row.githubUploads ||= [];
          row.githubUploads.push({
            path,
            version: upload.version,
            branch: service.getState().session.branch,
          });
        }, dialog)
      )
        dialog.close();
    } finally {
      row.githubBusy = false;
      onRowUpdate(row);
    }
  });
  window.addEventListener('storage', (event) => {
    if (event.key !== TOKEN_STORAGE && event.key !== null) return;
    service.disconnect();
    token = '';
    try {
      token = localStorage.getItem(TOKEN_STORAGE)?.trim() || '';
    } catch {}
    $('github-token').value = '';
    render();
    message('GitHub-Zugang wurde in einem anderen Tab geändert. Bitte erneut verbinden.');
  });
  render();
  return {
    updateRow: rowState,
    registerRow(row) {
      row.element.querySelector('.github-add').addEventListener('click', () => {
        if (!row.resultJpeg) return;
        const state = service.getState();
        if (!active(state) || state.busy || pendingUpload) return;
        selected = '';
        const draft = descriptionDraft(row);
        const upload = {
          row,
          blob: row.resultJpeg,
          version: row.result,
          branch: state.session?.branch,
          folder: '',
          product: null,
          draft,
        };
        pendingUpload = upload;
        catalogLoading = false;
        catalogError = '';
        $('github-image-name').value = '';
        selectFolder(null, state);
        $('github-image-description').value = draft.text;
        $('github-description-state').textContent = draft.text
          ? 'Gespeicherter Entwurf für dieses Bild. Bitte vor dem Übertragen prüfen.'
          : '';
        render();
        open($('github-image-dialog'));
      });
    },
  };
}
