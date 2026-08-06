document.addEventListener('DOMContentLoaded', () => {
  setupFadeIn();
  loadAssetGallery();
});

async function loadAssetGallery() {
  const galleryRoot = document.getElementById('galleryRoot');

  if (!galleryRoot) return;

  try {
    const assetEntries = await loadAssetEntries();

    if (assetEntries.length === 0) {
      renderPreparation(galleryRoot);
      return;
    }

    const photoEntries = await Promise.all(
      assetEntries.map(async (entry) => {
        const src = normalizeAssetSrc(entry.src);
        const fileName = entry.fileName || entry.name || src.split('/').pop();
        const orientation = await resolveOrientationForEntry(entry, src);

          return {
            fileName,
            src,
            orientation,
          };
        })
    );

    const grouped = {
      portraitPhoto: [],
      landscapePhoto: [],
    };

    photoEntries.forEach((entry) => {
      if (entry.orientation === 'portrait') {
        grouped.portraitPhoto.push(entry);
      } else {
        grouped.landscapePhoto.push(entry);
      }
    });

    renderGroupedRows(galleryRoot, grouped);
    setupInfiniteCarousels();
    setupMouseDrag();
  } catch (error) {
    renderPreparation(galleryRoot);
    setupMouseDrag();
  }
}

async function loadAssetEntries() {
  const folderEntries = await loadEntriesFromFolders();
  if (folderEntries.length > 0) {
    return folderEntries;
  }

  const manifestResponse = await fetch('assets/manifest.json').catch(() => null);

  if (manifestResponse && manifestResponse.ok) {
    const manifest = await manifestResponse.json().catch(() => null);
    const normalizedManifestEntries = normalizeManifestEntries(manifest);

    if (normalizedManifestEntries.length > 0) {
      return normalizedManifestEntries;
    }
  }

  const listingHtml = await fetch('assets/').then((response) => response.text());
  const matches = [...listingHtml.matchAll(/href=["']([^"']+)["']/gi)].map((match) => match[1]);
  const assetFiles = matches.filter((value) => !value.startsWith('../') && /\.(jpg|jpeg|png|webp|gif)$/i.test(value));

  return assetFiles.map((value) => ({ src: `assets/${value}` }));
}

async function loadEntriesFromFolders() {
  const folders = [
    { key: 'portrait', orientation: 'portrait' },
    { key: 'landscape', orientation: 'landscape' },
  ];

  const entries = [];

  for (const folder of folders) {
    const folderPath = `assets/${folder.key}`;
    const fileNames = await loadFolderFileNames(folderPath);

    fileNames.forEach((fileName) => {
      entries.push({
        src: `${folderPath}/${fileName}`,
        fileName,
        orientation: folder.orientation,
      });
    });
  }

  return entries;
}

async function loadFolderFileNames(folderPath) {
  const response = await fetch(`${folderPath}/`).catch(() => null);

  if (!response || !response.ok) {
    return [];
  }

  const listingHtml = await response.text();
  const matches = [...listingHtml.matchAll(/href=["']([^"']+)["']/gi)].map((match) => match[1]);
  return matches.filter((value) => !value.startsWith('../') && /\.(jpg|jpeg|png|webp|gif)$/i.test(value));
}

function normalizeManifestEntries(manifest) {
  if (!manifest) return [];

  const sourceFiles = Array.isArray(manifest) ? manifest : Array.isArray(manifest.files) ? manifest.files : [];

  return sourceFiles
    .map((entry) => {
      if (typeof entry === 'string') {
        const normalizedSource = entry.startsWith('assets/') ? entry : `assets/${entry}`;
        const fileName = entry.split('/').pop();
        const normalizedPath = entry.toLowerCase();
        const orientation = normalizedPath.includes('/portrait/') || normalizedPath.includes('/portrait')
          ? 'portrait'
          : normalizedPath.includes('/landscape/') || normalizedPath.includes('/landscape')
            ? 'landscape'
            : '';

        return {
          src: normalizedSource,
          fileName,
          orientation,
        };
      }

      if (!entry || typeof entry !== 'object') {
        return null;
      }

      if (!entry.src && !entry.fileName && !entry.name) {
        return null;
      }

      const source = entry.src || entry.fileName || entry.name;
      const normalizedSource = source.startsWith('assets/') ? source : `assets/${source}`;
      const normalizedPath = String(source).toLowerCase();
      const orientation = normalizedPath.includes('/portrait/') || normalizedPath.includes('/portrait')
        ? 'portrait'
        : normalizedPath.includes('/landscape/') || normalizedPath.includes('/landscape')
          ? 'landscape'
          : '';

      return {
        src: normalizedSource,
        fileName: entry.fileName || entry.name || source.split('/').pop(),
        orientation,
        poster: typeof entry.poster === 'string' ? entry.poster : '',
      };
    })
    .filter(Boolean);
}

function normalizeAssetSrc(src) {
  if (!src) return '';

  if (src.startsWith('assets/')) {
    return src;
  }

  if (src.startsWith('/')) {
    return src.replace(/^\/+/, '');
  }

  return `assets/${src}`;
}

async function resolveOrientationForEntry(entry, src) {
  if (entry.orientation === 'portrait' || entry.orientation === 'landscape') {
    return entry.orientation;
  }

  const pathHint = resolveOrientationFromPath(src);
  if (pathHint) {
    return pathHint;
  }

  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image.naturalWidth >= image.naturalHeight ? 'landscape' : 'portrait');
    image.onerror = () => resolve('landscape');
    image.src = src;
  });
}

function resolveOrientationFromPath(src) {
  const normalizedPath = src.toLowerCase();

  if (/(^|\/)(portrait|vertical|縦)(\/|$)/.test(normalizedPath)) {
    return 'portrait';
  }

  if (/(^|\/)(landscape|horizontal|横)(\/|$)/.test(normalizedPath)) {
    return 'landscape';
  }

  return '';
}

function renderPreparation(galleryRoot) {
  galleryRoot.innerHTML = `
    <section class="gallery-group">
      <div class="gallery-row infinite-carousel" role="region" aria-label="Preparation row">
        <div class="gallery-message">準備中です。<br />もうしばらくお待ちください。</div>
      </div>
    </section>
  `;
  setupInfiniteCarousels();
}

function renderGroupedRows(galleryRoot, grouped) {
  galleryRoot.innerHTML = '';

  const photoSection = document.createElement('section');
  photoSection.className = 'gallery-group';

  const photoCategories = [
    { key: 'portraitPhoto', label: '縦写真' },
    { key: 'landscapePhoto', label: '横写真' },
  ];

  renderCategoryRows(photoSection, photoCategories, grouped);

  if (!photoSection.querySelector('.gallery-row')) {
    photoSection.innerHTML = '<div class="gallery-row infinite-carousel" role="region" aria-label="Photo preparation row"><div class="gallery-message">準備中です。<br />もうしばらくお待ちください。</div></div>';
  }

  galleryRoot.appendChild(photoSection);
}

function renderCategoryRows(container, categories, grouped) {
  categories.forEach(({ key, label }) => {
    const items = grouped[key];

    if (!items.length) return;

    const rows = chunk(items, 20);

    rows.forEach((rowItems, rowIndex) => {
      const row = document.createElement('div');
      row.className = 'gallery-row infinite-carousel';
      row.setAttribute('role', 'region');
      row.setAttribute('aria-label', `${label} ${rowIndex + 1}`);

      rowItems.forEach((item) => {
        const media = document.createElement('div');
        media.className = `gallery-item ${item.orientation}`;

        media.innerHTML = `<img src="${item.src}" alt="${item.fileName}" loading="lazy" />`;

        row.appendChild(media);
      });

      container.appendChild(row);
    });
  });
}

function setupInfiniteCarousels() {
  const carousels = document.querySelectorAll('.infinite-carousel');

  carousels.forEach((carousel) => {
    const originalItems = Array.from(carousel.children);

    if (originalItems.length === 0) return;

    requestAnimationFrame(() => {
      carousel.scrollLeft = 0;
    });
  });
}

function setupFadeIn() {
  const sections = document.querySelectorAll('.fade-section');

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
        }
      });
    },
    {
      threshold: 0.1,
    }
  );

  sections.forEach((section) => {
    observer.observe(section);
    if (section.getBoundingClientRect().top < window.innerHeight) {
      section.classList.add('is-visible');
    }
  });
}

function setupMouseDrag() {
  const carousels = document.querySelectorAll('.gallery-row');

  carousels.forEach((carousel) => {
    let isDown = false;
    let startX = 0;
    let scrollLeft = 0;
    let moved = false;

    carousel.addEventListener('mousedown', (event) => {
      isDown = true;
      moved = false;
      startX = event.pageX - carousel.offsetLeft;
      scrollLeft = carousel.scrollLeft;
    });

    carousel.addEventListener('mouseleave', () => {
      isDown = false;
    });

    carousel.addEventListener('mouseup', () => {
      isDown = false;
    });

    carousel.addEventListener('mousemove', (event) => {
      if (!isDown) return;

      event.preventDefault();
      const x = event.pageX - carousel.offsetLeft;
      const walk = (x - startX) * 1.2;

      if (Math.abs(walk) > 5) {
        moved = true;
      }

      carousel.scrollLeft = scrollLeft - walk;
    });

    carousel.addEventListener(
      'click',
      (event) => {
        if (moved) {
          event.preventDefault();
          event.stopPropagation();
        }
      },
      true
    );
  });
}
