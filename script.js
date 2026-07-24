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

    const mediaEntries = await Promise.all(
      assetEntries.map(async (entry) => {
        const src = normalizeAssetSrc(entry.src);
        const fileName = entry.fileName || entry.name || src.split('/').pop();
        const isVideo = /\.(mp4|mov|webm)$/i.test(src);
        const orientation = await resolveOrientationForEntry(entry, src, isVideo);
        const poster = resolvePoster(entry, assetEntries);

        return {
          fileName,
          src,
          isVideo,
          orientation,
          poster,
        };
      })
    );

    const grouped = {
      portraitPhoto: [],
      landscapePhoto: [],
      portraitVideo: [],
      landscapeVideo: [],
    };

    mediaEntries.forEach((entry) => {
      if (entry.isVideo) {
        if (entry.orientation === 'portrait') {
          grouped.portraitVideo.push(entry);
        } else {
          grouped.landscapeVideo.push(entry);
        }
      } else if (entry.orientation === 'portrait') {
        grouped.portraitPhoto.push(entry);
      } else {
        grouped.landscapePhoto.push(entry);
      }
    });

    renderGroupedRows(galleryRoot, grouped);
    setupGalleryTabs();
    setupInfiniteCarousels();
    setupMouseDrag();
  } catch (error) {
    renderPreparation(galleryRoot);
    setupGalleryTabs();
    setupMouseDrag();
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

  const listingHtml = await fetch('assets/').then((response) => response.text());
  const matches = [...listingHtml.matchAll(/href="([^"]+)"/g)].map((match) => match[1]);
  const assetFiles = matches.filter((value) => !value.startsWith('../') && /\.(jpg|jpeg|png|webp|gif|mp4|mov|webm)$/i.test(value));

  return assetFiles.map((value) => ({ src: `assets/${value}` }));
}

function normalizeManifestEntries(manifest) {
  if (!manifest) return [];

  const sourceFiles = Array.isArray(manifest) ? manifest : Array.isArray(manifest.files) ? manifest.files : [];

  return sourceFiles
    .map((entry) => {
      if (typeof entry === 'string') {
        return {
          src: entry,
          fileName: entry.split('/').pop(),
        };
      }

      if (!entry || typeof entry !== 'object') {
        return null;
      }

      if (!entry.src && !entry.fileName && !entry.name) {
        return null;
      }

      const source = entry.src || entry.fileName || entry.name;
      return {
        src: source,
        fileName: entry.fileName || entry.name || source.split('/').pop(),
        orientation: typeof entry.orientation === 'string' ? entry.orientation.toLowerCase() : '',
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

async function resolveOrientationForEntry(entry, src, isVideo) {
  if (entry.orientation === 'portrait' || entry.orientation === 'landscape') {
    return entry.orientation;
  }

  const pathHint = resolveOrientationFromPath(src);
  if (pathHint) {
    return pathHint;
  }

  if (!isVideo) {
    return 'landscape';
  }

  return resolveOrientation(src, isVideo);
}

function resolveOrientationFromPath(src) {
  const normalizedPath = src.toLowerCase();

  if (/(^|\/)(portrait|vertical|縦)(\/|$)/.test(normalizedPath)) {
    return 'portrait';
  }

  if (/(^|\/)(landscape|horizontal|横)(\/|$)/.test(normalizedPath)) {
    return 'landscape';
  }

  if (normalizedPath.includes('/video/')) {
    return 'landscape';
  }

  return '';
}

function renderPreparation(galleryRoot) {
  galleryRoot.innerHTML = `
    <section class="gallery-group is-active" data-group="photo">
      <div class="gallery-row infinite-carousel" role="region" aria-label="Preparation row">
        <div class="gallery-message">準備中です。<br />もうしばらくお待ちください。</div>
      </div>
    </section>
    <section class="gallery-group" data-group="video">
      <div class="gallery-row infinite-carousel" role="region" aria-label="Video preparation row">
        <div class="gallery-message">映像準備中です。<br />もうしばらくお待ちください。</div>
      </div>
    </section>
  `;
  setupInfiniteCarousels();
}

async function resolveOrientation(src, isVideo) {
  if (isVideo) {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;

    await new Promise((resolve, reject) => {
      video.onloadedmetadata = resolve;
      video.onerror = reject;
      video.src = src;
    });

    return video.videoWidth >= video.videoHeight ? 'landscape' : 'portrait';
  }

  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image.naturalWidth >= image.naturalHeight ? 'landscape' : 'portrait');
    image.onerror = () => resolve('landscape');
    image.src = src;
  });
}

function resolvePoster(entry, assetEntries) {
  if (entry.poster) {
    return normalizeAssetSrc(entry.poster);
  }

  const fileName = entry.fileName || entry.name || entry.src.split('/').pop();
  const baseName = fileName.replace(/\.[^.]+$/i, '');
  const posterMatch = assetEntries.find((candidate) => {
    const candidateName = candidate.fileName || candidate.name || candidate.src.split('/').pop();
    const candidateBase = candidateName.replace(/\.[^.]+$/i, '');
    return candidateBase === baseName && /\.(jpg|jpeg|png|webp|gif)$/i.test(candidateName);
  });

  return posterMatch ? normalizeAssetSrc(posterMatch.src) : '';
}

function renderGroupedRows(galleryRoot, grouped) {
  galleryRoot.innerHTML = '';

  const photoSection = document.createElement('section');
  photoSection.className = 'gallery-group is-active';
  photoSection.dataset.group = 'photo';

  const videoSection = document.createElement('section');
  videoSection.className = 'gallery-group';
  videoSection.dataset.group = 'video';

  const photoCategories = [
    { key: 'portraitPhoto', label: '縦写真' },
    { key: 'landscapePhoto', label: '横写真' },
  ];

  const videoCategories = [
    { key: 'portraitVideo', label: '縦動画' },
    { key: 'landscapeVideo', label: '横動画' },
  ];

  renderCategoryRows(photoSection, photoCategories, grouped);
  renderCategoryRows(videoSection, videoCategories, grouped);

  if (!photoSection.querySelector('.gallery-row')) {
    photoSection.innerHTML = '<div class="gallery-row infinite-carousel" role="region" aria-label="Photo preparation row"><div class="gallery-message">準備中です。<br />もうしばらくお待ちください。</div></div>';
  }

  if (!videoSection.querySelector('.gallery-row')) {
    videoSection.innerHTML = '<div class="gallery-row infinite-carousel" role="region" aria-label="Video preparation row"><div class="gallery-message">映像準備中です。<br />もうしばらくお待ちください。</div></div>';
  }

  galleryRoot.appendChild(photoSection);
  galleryRoot.appendChild(videoSection);
  setupGalleryTabs();
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
        media.setAttribute('data-kind', item.isVideo ? 'video' : 'photo');

        if (item.isVideo) {
          const posterAttribute = item.poster ? ` poster="${item.poster}"` : '';
          media.innerHTML = `
            <video controls preload="metadata"${posterAttribute}>
              <source src="${item.src}" type="video/mp4" />
            </video>
          `;
        } else {
          media.innerHTML = `<img src="${item.src}" alt="${item.fileName}" loading="lazy" />`;
        }

        row.appendChild(media);
      });

      container.appendChild(row);
    });
  });
}

function setupGalleryTabs() {
  const tabs = document.querySelectorAll('.gallery-tab');
  const groups = document.querySelectorAll('.gallery-group');

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const mode = tab.dataset.mode;

      tabs.forEach((button) => button.classList.toggle('is-active', button === tab));
      groups.forEach((group) => {
        group.classList.toggle('is-active', group.dataset.group === mode);
      });
    });
  });
}

function chunk(items, size) {
  const result = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
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
