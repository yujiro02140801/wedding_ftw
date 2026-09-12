document.addEventListener('DOMContentLoaded', () => {
  loadAssetGallery();
});

async function loadAssetGallery() {
  const galleryRoot = document.getElementById('galleryRoot');

  if (!galleryRoot) return;

  try {
    const assetEntries = await loadAssetEntries();

    if (!assetEntries.length) {
      renderPreparation(galleryRoot);
      return;
    }

    const photoEntries = assetEntries
      .map((entry) => {
        const src = normalizeAssetSrc(entry.src || entry.fileName || entry.name || '');
        const fileName = entry.fileName || entry.name || src.split('/').pop();

        if (!src) return null;

        return { src, fileName };
      })
      .filter(Boolean);

    if (!photoEntries.length) {
      renderPreparation(galleryRoot);
      return;
    }

    renderVerticalGallery(galleryRoot, photoEntries);
  } catch (error) {
    renderPreparation(galleryRoot);
  }
}

async function loadAssetEntries() {
  const manifestResponse = await fetch('assets/manifest.json').catch(() => null);

  if (manifestResponse && manifestResponse.ok) {
    const manifest = await manifestResponse.json().catch(() => null);
    const normalizedManifestEntries = normalizeManifestEntries(manifest);

    if (normalizedManifestEntries.length > 0) {
      return normalizedManifestEntries;
    }
  }

  const directoryResponse = await fetch('assets/').catch(() => null);

  if (!directoryResponse || !directoryResponse.ok) {
    return [];
  }

  const listingHtml = await directoryResponse.text();
  const matches = [...listingHtml.matchAll(/href=["']([^"']+)["']/gi)].map((match) => match[1]);
  const assetFiles = matches.filter((value) => {
    return !value.startsWith('../')
      && !value.startsWith('manifest')
      && !value.includes('placeholder')
      && /\.(jpg|jpeg|png|webp|gif)$/i.test(value);
  });

  return assetFiles.map((value) => ({ src: `assets/${value}` }));
}

function normalizeManifestEntries(manifest) {
  if (!manifest) return [];

  const sourceFiles = Array.isArray(manifest) ? manifest : Array.isArray(manifest.files) ? manifest.files : [];

  return sourceFiles
    .map((entry) => {
      if (typeof entry === 'string') {
        const normalizedSource = entry.startsWith('assets/') ? entry : `assets/${entry}`;
        return {
          src: normalizedSource,
          fileName: entry.split('/').pop(),
        };
      }

      if (!entry || typeof entry !== 'object') {
        return null;
      }

      const source = entry.src || entry.fileName || entry.name;

      if (!source) {
        return null;
      }

      const normalizedSource = source.startsWith('assets/') ? source : `assets/${source}`;

      return {
        src: normalizedSource,
        fileName: entry.fileName || entry.name || source.split('/').pop(),
      };
    })
    .filter(Boolean);
}

function normalizeAssetSrc(src) {
  if (!src) return '';

  if (src.startsWith('assets/')) return src;
  if (src.startsWith('/')) return src.replace(/^\/+/, '');

  return `assets/${src}`;
}

function renderVerticalGallery(galleryRoot, photoEntries) {
  galleryRoot.innerHTML = '';

  photoEntries.forEach((item, index) => {
    const figure = document.createElement('figure');
    const image = document.createElement('img');
    const loading = index < 8 ? 'eager' : 'lazy';

    figure.className = 'gallery-item';
    image.alt = item.fileName;
    image.loading = loading;
    image.src = resolveImageSrc(item.src);
    image.addEventListener('error', () => {
      if (!image.src.match(/\.jpg$/i)) return;

      image.src = image.src.replace(/\.jpg$/i, (extension) => extension === '.jpg' ? '.JPG' : '.jpg');
    }, { once: true });

    figure.appendChild(image);
    galleryRoot.appendChild(figure);
  });
}

function resolveImageSrc(src) {
  if (!window.location.hostname.endsWith('github.io')) {
    return src;
  }

  return `https://media.githubusercontent.com/media/yujiro02140801/wedding_ftw/main/${src}`;
}

function renderPreparation(galleryRoot) {
  galleryRoot.innerHTML = '<div class="gallery-message">写真を読み込んでいます。<br />しばらくお待ちください。</div>';
}
