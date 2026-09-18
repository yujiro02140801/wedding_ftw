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
    setupLightbox();
  } catch (error) {
    renderPreparation(galleryRoot);
  }
}

async function loadAssetEntries() {
  const githubEntries = await loadGithubAssetEntries();

  if (githubEntries.length > 0) {
    return githubEntries;
  }

  const directoryEntries = await loadDirectoryAssetEntries();

  if (directoryEntries.length > 0) {
    return directoryEntries;
  }

  const manifestResponse = await fetch('assets/manifest.json').catch(() => null);

  if (manifestResponse && manifestResponse.ok) {
    const manifest = await manifestResponse.json().catch(() => null);
    const normalizedManifestEntries = normalizeManifestEntries(manifest);

    if (normalizedManifestEntries.length > 0) {
      return normalizedManifestEntries;
    }
  }

  return [];
}

async function loadDirectoryAssetEntries() {
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

  return assetFiles
    .sort(comparePhotoNames)
    .map((value) => ({
      src: `assets/${value}`,
      fileName: value,
    }));
}

async function loadGithubAssetEntries() {
  if (!window.location.hostname.endsWith('github.io')) {
    return [];
  }

  const response = await fetch('https://api.github.com/repos/yujiro02140801/wedding_ftw/git/trees/main?recursive=1')
    .catch(() => null);

  if (!response || !response.ok) {
    return [];
  }

  const tree = await response.json().catch(() => null);

  if (!tree || !Array.isArray(tree.tree)) {
    return [];
  }

  return tree.tree
    .filter((entry) => {
      return entry.type === 'blob'
        && entry.path.startsWith('assets/')
        && entry.path.split('/').length === 2
        && !entry.path.toLowerCase().includes('placeholder')
        && /\.(jpg|jpeg|png|webp|gif)$/i.test(entry.path);
    })
    .sort((first, second) => comparePhotoNames(first.path, second.path))
    .map((entry) => ({
      src: entry.path,
      fileName: entry.path.split('/').pop(),
    }));
}

function comparePhotoNames(first, second) {
  const firstName = typeof first === 'string' ? first : first.path;
  const secondName = typeof second === 'string' ? second : second.path;
  const firstKey = getPhotoOrderKey(firstName);
  const secondKey = getPhotoOrderKey(secondName);

  return firstKey - secondKey || firstName.localeCompare(secondName);
}

function getPhotoOrderKey(filePath) {
  const fileName = filePath.split('/').pop().toUpperCase();
  const timestampMatch = fileName.match(/^(\d{8}_\d{6})/);

  if (timestampMatch) {
    return Number(timestampMatch[1].replace(/\D/g, ''));
  }

  const cameraNumberMatch = fileName.match(/^(?:IMG[_-]?)?(\d+)/);

  if (cameraNumberMatch) {
    return Number(cameraNumberMatch[1]);
  }

  return Number.MAX_SAFE_INTEGER;
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

function setupLightbox() {
  const lightbox = document.createElement('div');
  const lightboxImage = document.createElement('img');
  const closeButton = document.createElement('button');

  lightbox.className = 'lightbox';
  lightbox.hidden = true;
  lightbox.setAttribute('role', 'dialog');
  lightbox.setAttribute('aria-modal', 'true');
  lightboxImage.alt = '';
  closeButton.className = 'lightbox-close';
  closeButton.type = 'button';
  closeButton.setAttribute('aria-label', '閉じる');
  closeButton.textContent = '×';

  lightbox.append(lightboxImage, closeButton);
  document.body.appendChild(lightbox);

  document.querySelectorAll('.gallery-item img').forEach((image) => {
    image.addEventListener('click', () => {
      lightboxImage.src = image.currentSrc || image.src;
      lightboxImage.alt = image.alt;
      lightbox.hidden = false;
      document.body.style.overflow = 'hidden';
    });
  });

  const closeLightbox = () => {
    lightbox.hidden = true;
    document.body.style.overflow = '';
    lightboxImage.removeAttribute('src');
  };

  closeButton.addEventListener('click', closeLightbox);
  lightbox.addEventListener('click', (event) => {
    if (event.target === lightbox) closeLightbox();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !lightbox.hidden) closeLightbox();
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
