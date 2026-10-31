'use strict';

// All navigation, product links and inquiries also work without JavaScript.
const status = document.querySelector('#site-status');
const announce = (message) => {
  if (status) status.textContent = message;
};
const contact = document.querySelector('#contact-dialog');
let contactTrigger;
contact?.addEventListener('close', () => {
  const target = contactTrigger?.getClientRects().length
    ? contactTrigger
    : document.querySelector('.mobile-nav > summary');
  target?.focus({preventScroll: true});
});
document.querySelectorAll('[data-contact]').forEach((link) => {
  link.addEventListener('click', (event) => {
    if (!contact || typeof contact.showModal !== 'function' || event.metaKey || event.ctrlKey)
      return;
    event.preventDefault();
    contactTrigger = link;
    document.querySelector('#contact-email').href = link.href;
    document.querySelector('[data-contact-context]').textContent = link.dataset.productName
      ? `Du interessierst dich für „${link.dataset.productName}“? Produktname und Link stehen bereits in deiner E-Mail-Anfrage.`
      : 'Erzähl uns von deinem Wunschprodukt, einem Motiv oder einem besonderen Anlass.';
    document.querySelector('.mobile-nav')?.removeAttribute('open');
    contact.showModal();
  });
});
document.querySelectorAll('dialog').forEach((dialog) => {
  dialog.querySelector('[data-close-dialog]')?.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (event) => {
    const box = dialog.getBoundingClientRect();
    if (
      event.target === dialog &&
      (event.clientX < box.left ||
        event.clientX > box.right ||
        event.clientY < box.top ||
        event.clientY > box.bottom)
    )
      dialog.close();
  });
});

const menus = [...document.querySelectorAll('.category-menu, .mobile-nav')];
document.addEventListener('click', (event) => {
  menus.forEach((menu) => {
    if (!menu.contains(event.target)) menu.open = false;
  });
});
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  menus.forEach((menu) => {
    if (menu.open) {
      menu.open = false;
      menu.querySelector('summary').focus();
    }
  });
});
document.querySelectorAll('.mobile-nav a').forEach((link) => {
  link.addEventListener('click', () => link.closest('.mobile-nav').removeAttribute('open'));
});

document.querySelectorAll('[data-catalog]').forEach((catalog) => {
  const grid = catalog.querySelector('[data-product-grid]');
  const sort = catalog.querySelector('[name="sort"]');
  const counter = catalog.querySelector('[data-result-count]');
  const empty = catalog.querySelector('[data-empty]');
  const sortControl = catalog.querySelector('[data-sort-control]');
  // Leave static links usable when markup is incomplete or from a different build.
  if (!grid || !sort || !counter || !empty || !sortControl) return;
  const items = [...grid.querySelectorAll('[data-product]')].map((element, index) => ({
    element,
    index,
    name: element.dataset.name,
    date: element.dataset.created || '',
    tags: JSON.parse(element.dataset.tags),
  }));
  // Category comes from the generated page path, never from query parameters.
  const selectedTag = catalog.dataset.initialTag || '';
  sortControl.hidden = false;
  const readUrl = () => {
    const url = new URL(location.href);
    if (url.searchParams.has('tag') || url.searchParams.has('q')) {
      url.searchParams.delete('tag');
      url.searchParams.delete('q');
      history.replaceState(null, '', url);
    }
    const requestedSort = url.searchParams.get('sort') || 'default';
    sort.value = [...sort.options].some((option) => option.value === requestedSort)
      ? requestedSort
      : 'default';
  };
  const apply = (updateUrl = true) => {
    let count = 0;
    const ordered = [...items].sort((a, b) => {
      const nameOrder = a.name.localeCompare(b.name, 'de');
      if (sort.value === 'newest') return b.date.localeCompare(a.date) || nameOrder;
      if (sort.value === 'name-desc') return -nameOrder;
      if (sort.value === 'name-asc') return nameOrder;
      return a.index - b.index;
    });
    for (const {element, tags} of ordered) {
      const visible = !selectedTag || tags.includes(selectedTag);
      const wasHidden = element.hidden || element.classList.contains('catalog-hidden');
      element.hidden = !visible;
      element.classList.remove('catalog-hidden');
      if (visible) count++;
      if (visible && wasHidden) {
        element.classList.remove('filter-enter');
        requestAnimationFrame(() => element.classList.add('filter-enter'));
      }
      grid.append(element);
    }
    counter.textContent = `${count} ${count === 1 ? 'Produkt' : 'Produkte'}${
      selectedTag ? ` · ${selectedTag}` : ' · Alle Kategorien'
    }`;
    empty.hidden = count > 0;
    if (updateUrl) {
      const url = new URL(location.href);
      url.searchParams.delete('q');
      url.searchParams.delete('tag');
      if (sort.value === 'default') url.searchParams.delete('sort');
      else url.searchParams.set('sort', sort.value);
      if (url.href !== location.href) history.pushState(null, '', url);
    }
  };
  sort.addEventListener('change', () => apply());
  window.addEventListener('popstate', () => {
    readUrl();
    apply(false);
  });
  readUrl();
  apply(false);
});

document.querySelectorAll('[data-gallery]').forEach((gallery) => {
  const thumbnails = [...gallery.querySelectorAll('[data-thumbnail]')];
  const main = gallery.querySelector('[data-main-image]');
  const enlarge = gallery.querySelector('[data-enlarge]');
  const lightbox = gallery.querySelector('[data-lightbox]');
  const lightboxImage = gallery.querySelector('[data-lightbox-image]');
  const controls = gallery.querySelector('[data-gallery-controls]');
  let index = 0;
  const select = (next) => {
    index = (next + thumbnails.length) % thumbnails.length;
    const thumbnail = thumbnails[index];
    main.src = thumbnail.dataset.large;
    main.alt = `${gallery.getAttribute('aria-label').replace('Bildergalerie: ', '')} – Ansicht ${
      index + 1
    }`;
    enlarge.href = thumbnail.dataset.large;
    thumbnails.forEach((item, i) => {
      if (i === index) item.setAttribute('aria-current', 'true');
      else item.removeAttribute('aria-current');
    });
    if (controls)
      controls.querySelector('[data-image-count]').textContent = `${index + 1} / ${
        thumbnails.length
      }`;
    if (lightbox.open) {
      lightboxImage.src = thumbnail.dataset.large;
      lightboxImage.alt = main.alt;
      lightbox.querySelector('[data-lightbox-count]').textContent = `${index + 1} / ${
        thumbnails.length
      }`;
    }
  };
  if (controls) controls.hidden = false;
  thumbnails.forEach((thumbnail, i) => {
    thumbnail.setAttribute('aria-label', `Ansicht ${i + 1} anzeigen`);
    thumbnail.addEventListener('click', (event) => {
      if (event.ctrlKey || event.metaKey || event.shiftKey) return;
      event.preventDefault();
      select(i);
    });
  });
  gallery
    .querySelectorAll('[data-previous]')
    .forEach((button) => button.addEventListener('click', () => select(index - 1)));
  gallery
    .querySelectorAll('[data-next]')
    .forEach((button) => button.addEventListener('click', () => select(index + 1)));
  enlarge.addEventListener('click', (event) => {
    if (
      typeof lightbox.showModal !== 'function' ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey
    )
      return;
    event.preventDefault();
    lightbox.showModal();
    select(index);
  });
  gallery.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      select(index + (event.key === 'ArrowRight' ? 1 : -1));
    }
  });
  let touchStart;
  const touchSurface = (element) => {
    element.addEventListener(
      'touchstart',
      (event) => {
        touchStart = event.touches.length === 1 ? event.touches[0] : undefined;
      },
      {passive: true},
    );
    element.addEventListener(
      'touchend',
      (event) => {
        if (!touchStart) return;
        const dx = event.changedTouches[0].clientX - touchStart.clientX;
        const dy = event.changedTouches[0].clientY - touchStart.clientY;
        touchStart = undefined;
        if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.4)
          select(index + (dx < 0 ? 1 : -1));
      },
      {passive: true},
    );
  };
  touchSurface(gallery.querySelector('.gallery-stage'));
  touchSurface(lightboxImage);
  if (thumbnails.length < 2) lightbox.querySelector('.lightbox-controls').hidden = true;
});

document.querySelectorAll('[data-share]').forEach((button) => {
  button.hidden = false;
  button.addEventListener('click', async () => {
    const url = document.querySelector('link[rel="canonical"]').href;
    try {
      if (navigator.share) await navigator.share({title: button.dataset.title, url});
      else if (navigator.clipboard) {
        await navigator.clipboard.writeText(url);
        announce('Produktlink kopiert.');
      } else announce(`Produktlink: ${url}`);
    } catch (error) {
      if (error.name !== 'AbortError')
        announce(`Teilen ist hier nicht möglich. Produktlink: ${url}`);
    }
  });
});
// Content stays visible if JavaScript, observers or animation are unavailable.
if (
  'IntersectionObserver' in window &&
  !window.matchMedia('(prefers-reduced-motion: reduce)').matches
) {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('reveal-in');
          observer.unobserve(entry.target);
        }
      });
    },
    {threshold: 0.08},
  );
  document
    .querySelectorAll('.about-layout, .personalization-inner')
    .forEach((section) => observer.observe(section));
}
