'use strict';

// Local canvas edits only: neither previewing nor applying contacts the API.
export function createImageEditor(dialog) {
  const canvas = dialog.querySelector('#crop-canvas');
  const context = canvas.getContext('2d');
  const ratioSelect = dialog.querySelector('#crop-ratio');
  const error = dialog.querySelector('#editor-error');
  const fields = [...dialog.querySelectorAll('[data-crop]')];
  const clamp = (value, min, max) => Math.max(min, Math.min(value, max));
  let session = null;
  let drag = null;

  function dimensions() {
    return session.turns % 2
      ? {width: session.source.naturalHeight, height: session.source.naturalWidth}
      : {width: session.source.naturalWidth, height: session.source.naturalHeight};
  }

  function ratio() {
    if (ratioSelect.value === 'free') return null;
    const [width, height] = ratioSelect.value.split(':').map(Number);
    return width / height;
  }

  function normalize(box) {
    const size = dimensions();
    const width = clamp(Math.round(box.width), 1, size.width);
    const height = clamp(Math.round(box.height), 1, size.height);
    return {
      x: clamp(Math.round(box.x), 0, size.width - width),
      y: clamp(Math.round(box.y), 0, size.height - height),
      width,
      height,
    };
  }

  function fitRatio(box) {
    const aspect = ratio();
    if (!aspect) return normalize(box);
    const width = Math.min(box.width, box.height * aspect);
    const height = width / aspect;
    return normalize({
      x: box.x + (box.width - width) / 2,
      y: box.y + (box.height - height) / 2,
      width,
      height,
    });
  }

  function draw() {
    const size = dimensions();
    const scale = Math.min(1, 1100 / size.width, 480 / size.height);
    canvas.width = Math.max(1, Math.round(size.width * scale));
    canvas.height = Math.max(1, Math.round(size.height * scale));
    const sx = canvas.width / size.width;
    const sy = canvas.height / size.height;
    context.save();
    context.scale(sx, sy);
    context.translate(size.width / 2, size.height / 2);
    context.rotate((session.turns * Math.PI) / 2);
    context.drawImage(
      session.source,
      -session.source.naturalWidth / 2,
      -session.source.naturalHeight / 2,
    );
    context.restore();
    const {x, y, width, height} = session.crop;
    const left = x * sx;
    const top = y * sy;
    const right = (x + width) * sx;
    const bottom = (y + height) * sy;
    context.fillStyle = 'rgba(25, 38, 30, .55)';
    context.beginPath();
    context.rect(0, 0, canvas.width, canvas.height);
    context.rect(left, top, right - left, bottom - top);
    context.fill('evenodd');
    context.strokeStyle = '#fffefa';
    context.lineWidth = 1.5;
    context.strokeRect(left, top, right - left, bottom - top);
    context.lineWidth = 0.5;
    for (const fraction of [1 / 3, 2 / 3]) {
      context.beginPath();
      context.moveTo(left + (right - left) * fraction, top);
      context.lineTo(left + (right - left) * fraction, bottom);
      context.moveTo(left, top + (bottom - top) * fraction);
      context.lineTo(right, top + (bottom - top) * fraction);
      context.stroke();
    }
    context.fillStyle = '#fffefa';
    for (const [cx, cy] of [
      [left, top],
      [right, top],
      [right, bottom],
      [left, bottom],
    ]) {
      context.fillRect(cx - 5, cy - 5, 10, 10);
    }
    const bounds = {
      x: size.width - width,
      y: size.height - height,
      width: size.width - x,
      height: size.height - y,
    };
    for (const field of fields) {
      field.value = session.crop[field.dataset.crop];
      field.max = bounds[field.dataset.crop];
    }
    dialog.querySelector('#editor-output').textContent = `${width} × ${height} px · Drehung ${
      session.turns * 90
    }°`;
  }

  function point(event) {
    const rect = canvas.getBoundingClientRect();
    const size = dimensions();
    return {
      x: clamp(((event.clientX - rect.left) / rect.width) * size.width, 0, size.width),
      y: clamp(((event.clientY - rect.top) / rect.height) * size.height, 0, size.height),
    };
  }

  canvas.addEventListener('pointerdown', (event) => {
    if (!session || session.applying || !event.isPrimary || event.button !== 0) return;
    event.preventDefault();
    const start = point(event);
    const box = {...session.crop};
    const size = dimensions();
    const rect = canvas.getBoundingClientRect();
    const corners = [
      [box.x, box.y, box.x + box.width, box.y + box.height],
      [box.x + box.width, box.y, box.x, box.y + box.height],
      [box.x + box.width, box.y + box.height, box.x, box.y],
      [box.x, box.y + box.height, box.x + box.width, box.y],
    ];
    const corner = corners.find(
      ([x, y]) =>
        Math.abs(start.x - x) < (14 * size.width) / rect.width &&
        Math.abs(start.y - y) < (14 * size.height) / rect.height,
    );
    const inside =
      start.x > box.x &&
      start.x < box.x + box.width &&
      start.y > box.y &&
      start.y < box.y + box.height;
    const full = box.width === size.width && box.height === size.height;
    drag = {
      pointerId: event.pointerId,
      start,
      box,
      kind: corner ? 'resize' : inside && !full ? 'move' : 'new',
      anchor: corner ? {x: corner[2], y: corner[3]} : start,
    };
    canvas.setPointerCapture(event.pointerId);
  });

  canvas.addEventListener('pointermove', (event) => {
    if (!drag || drag.pointerId !== event.pointerId || !session) return;
    const current = point(event);
    if (drag.kind === 'move') {
      session.crop = normalize({
        ...drag.box,
        x: drag.box.x + current.x - drag.start.x,
        y: drag.box.y + current.y - drag.start.y,
      });
    } else {
      const anchor = drag.anchor;
      let width = Math.abs(current.x - anchor.x);
      let height = Math.abs(current.y - anchor.y);
      const aspect = ratio();
      if (aspect) {
        width = Math.min(width, height * aspect);
        height = width / aspect;
      }
      session.crop = normalize({
        x: current.x < anchor.x ? anchor.x - width : anchor.x,
        y: current.y < anchor.y ? anchor.y - height : anchor.y,
        width,
        height,
      });
    }
    draw();
  });

  const finishDrag = (event) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (event.type === 'pointercancel' && session) {
      session.crop = drag.box;
      draw();
    }
    drag = null;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  };
  canvas.addEventListener('pointerup', finishDrag);
  canvas.addEventListener('pointercancel', finishDrag);
  canvas.addEventListener('lostpointercapture', () => {
    drag = null;
  });

  ratioSelect.addEventListener('change', () => {
    if (!session) return;
    session.crop = fitRatio(session.crop);
    draw();
  });
  for (const field of fields)
    field.addEventListener('change', () => {
      if (!session) return;
      const key = field.dataset.crop;
      const value = field.valueAsNumber;
      if (!Number.isFinite(value)) {
        draw();
        return;
      }
      const size = dimensions();
      const box = {...session.crop};
      const aspect = ratio();
      if (key === 'x' || key === 'y') box[key] = value;
      else {
        box[key] = clamp(value, 1, key === 'width' ? size.width - box.x : size.height - box.y);
        if (aspect) {
          if (key === 'width') box.height = box.width / aspect;
          else box.width = box.height * aspect;
          const scale = Math.min(
            1,
            (size.width - box.x) / box.width,
            (size.height - box.y) / box.height,
          );
          box.width *= scale;
          box.height *= scale;
        }
      }
      session.crop = normalize(box);
      draw();
    });

  function setApplying(applying) {
    session.applying = applying;
    dialog
      .querySelectorAll('button:not([data-editor="cancel"]), select, input')
      .forEach((control) => {
        control.disabled = applying;
      });
    dialog.querySelector('[data-editor="apply"]').textContent = applying
      ? 'Bild wird vorbereitet …'
      : 'Änderungen übernehmen';
  }

  async function apply() {
    const current = session;
    if (!current || current.applying) return;
    // Opening and accepting without changes preserves the exact existing file.
    if (JSON.stringify({turns: current.turns, crop: current.crop}) === current.initial) {
      dialog.close();
      return;
    }
    setApplying(true);
    error.hidden = true;
    let output;
    try {
      const size = dimensions();
      const crop = current.crop;
      let image = current.sourceUrl;
      let bytes = Math.floor((image.split(',')[1].length * 3) / 4);
      if (
        current.turns ||
        crop.x ||
        crop.y ||
        crop.width !== size.width ||
        crop.height !== size.height
      ) {
        output = document.createElement('canvas');
        output.width = crop.width;
        output.height = crop.height;
        const target = output.getContext('2d');
        target.translate(size.width / 2 - crop.x, size.height / 2 - crop.y);
        target.rotate((current.turns * Math.PI) / 2);
        target.drawImage(
          current.source,
          -current.source.naturalWidth / 2,
          -current.source.naturalHeight / 2,
        );
        const mime = current.sourceUrl.startsWith('data:image/jpeg;') ? 'image/jpeg' : 'image/png';
        const blob = await new Promise((resolve) => output.toBlob(resolve, mime, 0.95));
        if (!blob)
          throw new Error('Das Bild konnte nicht vorbereitet werden. Bitte erneut versuchen.');
        if (blob.size > 10 * 1024 * 1024)
          throw new Error(
            'Das bearbeitete Bild ist größer als 10 MB. Bitte einen kleineren Ausschnitt wählen.',
          );
        bytes = blob.size;
        image = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () =>
            reject(new Error('Das bearbeitete Bild konnte nicht gelesen werden.'));
          reader.readAsDataURL(blob);
        });
      }
      if (session !== current || !dialog.open) return;
      current.result = {
        image,
        bytes,
        width: crop.width,
        height: crop.height,
        edit: {turns: current.turns, crop: {...crop}},
      };
      dialog.close();
    } catch (failure) {
      if (session === current && dialog.open) {
        error.textContent = failure.message || 'Die Bearbeitung konnte nicht übernommen werden.';
        error.hidden = false;
      }
    } finally {
      if (output) {
        output.width = 1;
        output.height = 1;
      }
      if (session === current) setApplying(false);
    }
  }

  dialog.addEventListener('click', (event) => {
    const action = event.target.closest('[data-editor]')?.dataset.editor;
    if (action === 'cancel') dialog.close();
    if (!session || session.applying) return;
    if (action === 'apply') {
      apply();
      return;
    }
    if (action === 'reset') {
      session.turns = 0;
      session.crop = {
        x: 0,
        y: 0,
        width: session.source.naturalWidth,
        height: session.source.naturalHeight,
      };
      ratioSelect.value = 'free';
      error.hidden = true;
      draw();
    } else if (action === 'left' || action === 'right') {
      const size = dimensions();
      const box = session.crop;
      session.crop =
        action === 'right'
          ? {x: size.height - box.y - box.height, y: box.x, width: box.height, height: box.width}
          : {x: box.y, y: size.width - box.x - box.width, width: box.height, height: box.width};
      session.turns = (session.turns + (action === 'right' ? 1 : 3)) % 4;
      ratioSelect.value = 'free';
      draw();
    }
  });
  dialog.addEventListener('close', () => {
    if (!session) return;
    const current = session;
    setApplying(false);
    session = null;
    drag = null;
    canvas.width = canvas.height = 1;
    current.resolve(current.result || null);
    current.source.src = '';
  });

  return {
    async open(sourceUrl, edit) {
      if (session) return null;
      const source = new Image();
      source.src = sourceUrl;
      await source.decode();
      const turns = edit?.turns || 0;
      const crop = edit?.crop
        ? {...edit.crop}
        : {x: 0, y: 0, width: source.naturalWidth, height: source.naturalHeight};
      return new Promise((resolve) => {
        session = {
          source,
          sourceUrl,
          turns,
          crop,
          resolve,
          initial: JSON.stringify({turns, crop}),
          applying: false,
        };
        ratioSelect.value = 'free';
        error.hidden = true;
        draw();
        dialog.showModal();
      });
    },
  };
}
