let currentTrailerItem = null;
let currentTrailerIndex = 0;

function getTrailerState() {
    const trailers = Array.isArray(currentTrailerItem?.trailers) ? currentTrailerItem.trailers : [];
    const nextIndex = Math.min(Math.max(currentTrailerIndex, 0), Math.max(trailers.length - 1, 0));
    return {
        item: currentTrailerItem,
        trailers,
        trailer: trailers[nextIndex] || null,
        index: nextIndex
    };
}

function syncBodyModalState() {
    const hasActiveModal = Boolean(
        document.getElementById('intel-dossier')?.classList.contains('active') ||
        document.getElementById('intel-dossier-overlay')?.classList.contains('active') ||
        document.getElementById('trailer-modal')?.classList.contains('active') ||
        document.getElementById('trailer-modal-overlay')?.classList.contains('active') ||
        document.getElementById('mobile-sheet-overlay')?.classList.contains('active')
    );

    document.body.classList.toggle('modal-open', hasActiveModal);
}

function renderTrailerModal() {
    const { item, trailers, trailer, index } = getTrailerState();
    const titleElement = document.getElementById('trailer-modal-title');
    const subtitleElement = document.getElementById('trailer-modal-subtitle');
    const iframeElement = document.getElementById('trailer-modal-frame');
    const listElement = document.getElementById('trailer-modal-list');
    const externalLink = document.getElementById('trailer-modal-link');

    if (titleElement) {
        titleElement.textContent = item?.title || '预告片';
    }
    if (subtitleElement) {
        subtitleElement.textContent = trailer?.title || '';
    }
    if (iframeElement) {
        iframeElement.src = trailer?.embedUrl || '';
        iframeElement.title = trailer?.title || item?.title || '预告片';
    }
    if (externalLink) {
        if (trailer?.url) {
            externalLink.href = trailer.url;
            externalLink.hidden = false;
        } else {
            externalLink.hidden = true;
            externalLink.removeAttribute('href');
        }
    }
    if (listElement) {
        listElement.innerHTML = '';
        trailers.forEach((entry, entryIndex) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'trailer-list-btn';
            if (entryIndex === index) {
                button.classList.add('active');
            }
            button.textContent = trailers.length > 1 ? `预告片 ${entryIndex + 1}` : '当前预告片';
            button.title = entry.title || '预告片';
            button.addEventListener('click', () => switchTrailer(entryIndex));
            listElement.appendChild(button);
        });
    }
}

function switchTrailer(index) {
    currentTrailerIndex = index;
    renderTrailerModal();
}

export function openTrailerModal(item, trailerIndex = 0) {
    if (!item || !Array.isArray(item.trailers) || item.trailers.length === 0) {
        return;
    }

    const overlay = document.getElementById('trailer-modal-overlay');
    const modal = document.getElementById('trailer-modal');
    if (!overlay || !modal) return;

    currentTrailerItem = item;
    currentTrailerIndex = trailerIndex;
    renderTrailerModal();
    overlay.classList.add('active');
    modal.classList.add('active');
    document.body.classList.add('modal-open');
}

export function closeTrailerModal() {
    const overlay = document.getElementById('trailer-modal-overlay');
    const modal = document.getElementById('trailer-modal');
    const iframeElement = document.getElementById('trailer-modal-frame');
    if (!overlay || !modal) return;

    overlay.classList.remove('active');
    modal.classList.remove('active');
    if (iframeElement) {
        iframeElement.src = '';
    }
    currentTrailerItem = null;
    currentTrailerIndex = 0;
    syncBodyModalState();
}

export function initTrailerModalEvents() {
    const overlay = document.getElementById('trailer-modal-overlay');
    const closeButton = document.getElementById('close-trailer-modal-btn');

    if (overlay) {
        overlay.addEventListener('click', closeTrailerModal);
    }
    if (closeButton) {
        closeButton.addEventListener('click', closeTrailerModal);
    }

    document.addEventListener('keydown', (event) => {
        const modal = document.getElementById('trailer-modal');
        if (event.key === 'Escape' && modal?.classList.contains('active')) {
            closeTrailerModal();
        }
    });
}
