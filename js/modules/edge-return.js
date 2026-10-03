// Project thresholds: a reserved 24–56px inset start strip, rightward only.
// Keep the native system edge and ordinary content scrolling available.
export function createReturnGesture(start, width) {
    let phase = 'candidate';
    let distance = 0;
    let previous = 0;
    return {
        move(point) {
            if (phase === 'cancelled' || phase === 'complete') return { phase, distance: 0 };
            const x = point.x - start.x, y = Math.abs(point.y - start.y);
            if (phase === 'candidate' && Math.max(Math.abs(x), y) >= 12) {
                phase = x > y * 1.5 ? 'dragging' : 'cancelled';
            }
            if (phase === 'dragging' && (x < previous - 12 || x < 0 || y > Math.max(24, x / 1.5))) phase = 'cancelled';
            previous = x;
            distance = phase === 'dragging' ? Math.min(width, Math.max(0, x)) : 0;
            return { phase, distance };
        },
        finish() {
            const complete = phase === 'dragging' && distance >= Math.max(72, width * .25);
            phase = complete ? 'complete' : 'cancelled';
            return complete;
        },
        cancel() { phase = 'cancelled'; distance = 0; }
    };
}

export function attachEdgeReturn(panel, onReturn) {
    if (!panel) return;
    let session;
    let pointer;
    let suppressUntil = 0;
    const valid = () => innerWidth <= 760 && panel.classList.contains('active') && !panel.inert;
    function reset() {
        session?.cancel();
        session = null;
        panel.classList.remove('return-dragging');
        panel.style.removeProperty('--return-distance');
        if (pointer !== undefined && panel.hasPointerCapture(pointer)) panel.releasePointerCapture(pointer);
        pointer = undefined;
    }
    panel.addEventListener('pointerdown', event => {
        reset();
        if (!valid() || !event.isPrimary || event.button !== 0) return;
        if (event.target.closest('button,a,input,textarea,select,[contenteditable="true"]') || document.activeElement?.matches('input,textarea,[contenteditable="true"]') || window.getSelection()?.toString()) return;
        const bounds = panel.getBoundingClientRect();
        const inset = event.clientX - bounds.left;
        if (event.clientX < 24 || inset < 24 || inset > 56) return;
        // Avoid locally horizontal scrolling surfaces, even in the start strip.
        for (let node = event.target; node && node !== panel; node = node.parentElement) {
            if (node.scrollWidth > node.clientWidth && /auto|scroll/.test(getComputedStyle(node).overflowX)) return;
        }
        session = createReturnGesture({ x: event.clientX, y: event.clientY }, bounds.width);
        pointer = event.pointerId;
    });
    window.addEventListener('pointerdown', event => { if (session && event.pointerId !== pointer) reset(); }, { passive: true });
    panel.addEventListener('pointermove', event => {
        if (!session || event.pointerId !== pointer) return;
        if (!valid()) { reset(); return; }
        const result = session.move({ x: event.clientX, y: event.clientY });
        if (result.phase === 'cancelled') { reset(); return; }
        if (result.phase === 'dragging') {
            panel.setPointerCapture(pointer);
            panel.classList.add('return-dragging');
            panel.style.setProperty('--return-distance', `${result.distance}px`);
            if (event.cancelable) event.preventDefault();
            suppressUntil = performance.now() + 500;
        }
    });
    panel.addEventListener('pointerup', event => {
        if (!session || event.pointerId !== pointer) return;
        session.move({ x: event.clientX, y: event.clientY });
        const complete = valid() && session.finish();
        reset();
        if (complete) onReturn();
    });
    for (const type of ['pointercancel', 'lostpointercapture']) panel.addEventListener(type, reset);
    window.addEventListener('click', event => {
        if (performance.now() >= suppressUntil) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        suppressUntil = 0;
    }, true);
    for (const type of ['resize', 'orientationchange', 'pagehide', 'popstate', 'hashchange']) window.addEventListener(type, reset);
    window.visualViewport?.addEventListener('resize', reset);
    document.addEventListener('visibilitychange', reset);
    new MutationObserver(() => { if (session && !valid()) reset(); }).observe(panel, { attributes: true, attributeFilter: ['class', 'inert', 'aria-hidden'] });
}
