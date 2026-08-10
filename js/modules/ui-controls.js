/**
 * UI 交互控制模块
 * 负责筛选器展开收起、滚动渐变、Toast 提示等 UI 交互
 */

/**
 * 更新筛选器折叠状态
 */
export function updateFilterCollapse(container, toggleButton, isExpanded, enabled = true) {
    if (!container || !toggleButton) return;

    container.classList.remove('collapsed');
    container.removeAttribute('data-visible-rows');
    container.style.removeProperty('--collapsed-height');
    toggleButton.hidden = true;
    toggleButton.setAttribute('aria-expanded', 'false');
    toggleButton.setAttribute('aria-controls', container.id);

    if (!enabled || window.innerWidth <= 760) return;

    const tags = [...container.querySelectorAll('.genre-tag')];
    if (tags.length === 0) return;

    const containerTop = container.getBoundingClientRect().top;
    const tagRows = tags.map((tag) => {
        const rect = tag.getBoundingClientRect();
        return {
            tag,
            top: Math.round(rect.top - containerTop),
            bottom: Math.ceil(rect.bottom - containerTop)
        };
    });

    const rowTops = [...new Set(tagRows.map((row) => row.top))].sort((a, b) => a - b);
    if (rowTops.length <= 1) return;

    const visibleRows = new Set(rowTops.slice(0, 1));
    const collapsedHeight = Math.max(
        ...tagRows
            .filter((row) => visibleRows.has(row.top))
            .map((row) => row.bottom)
    );

    container.style.setProperty('--collapsed-height', `${collapsedHeight}px`);
    container.dataset.visibleRows = '1';
    container.classList.toggle('collapsed', !isExpanded);
    toggleButton.hidden = false;
    toggleButton.textContent = isExpanded ? '收起' : '展开';
    toggleButton.setAttribute('aria-expanded', String(isExpanded));
}

/**
 * 减弱动效偏好下，滚动直接落到目标位置，避免动画成为完成任务的前置条件。
 */
export function getScrollBehavior() {
    return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
}

/**
 * 设置滚动渐变效果
 */
export function setupScrollFade(container) {
    if (!container) return;

    function updateFade() {
        const isAtEnd = container.scrollLeft + container.clientWidth >= container.scrollWidth - 5;
        container.classList.toggle('scrolled-to-end', isAtEnd);
    }

    setTimeout(updateFade, 100);
    container.addEventListener('scroll', updateFade, { passive: true });
    window.addEventListener(
        'resize',
        () => {
            setTimeout(updateFade, 100);
        },
        { passive: true }
    );
}

/**
 * 显示 Toast 提示
 */
export function showToast(message) {
    const toast = document.getElementById('toast-notification');
    if (!toast) return;

    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

/**
 * 返回顶部按钮控制
 */
export function setupBackToTop(button) {
    if (!button) return () => {};

    button.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: getScrollBehavior() });
    });

    return (scrollY = window.scrollY) => {
        const isVisible = scrollY > 600;
        button.classList.toggle('visible', isVisible);
        button.hidden = !isVisible;
    };
}

/**
 * 为首屏和章节增加一次性编排。HTML 默认完整可见，只有 JS 成功初始化后才启用入场状态。
 */
export function setupEditorialMotion() {
    const body = document.body;
    const hero = document.querySelector('.hero-header');
    const revealSections = [...document.querySelectorAll('.reveal-section')];
    const reducedMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    if (reducedMotion) {
        revealSections.forEach((section) => section.classList.add('is-visible'));
        return () => {};
    }

    body.classList.add('motion-ready');
    requestAnimationFrame(() => body.classList.add('motion-started'));

    const revealObserver = 'IntersectionObserver' in window
        ? new IntersectionObserver((entries, observer) => {
            entries.forEach((entry) => {
                if (!entry.isIntersecting) return;
                entry.target.classList.add('is-visible');
                observer.unobserve(entry.target);
            });
        }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 })
        : null;

    revealSections.forEach((section) => {
        if (revealObserver) revealObserver.observe(section);
        else section.classList.add('is-visible');
    });

    const finePointer = globalThis.matchMedia?.('(hover: hover) and (pointer: fine)');
    let heroIsVisible = true;
    let pointerFrame = 0;
    let pointerX = 0;
    let pointerY = 0;

    const resetPointer = () => {
        if (!hero) return;
        hero.style.setProperty('--hero-pointer-x', '0px');
        hero.style.setProperty('--hero-pointer-y', '0px');
    };

    const paintPointer = () => {
        pointerFrame = 0;
        if (!hero || !finePointer?.matches || !heroIsVisible || document.hidden) {
            resetPointer();
            return;
        }
        hero.style.setProperty('--hero-pointer-x', `${pointerX.toFixed(2)}px`);
        hero.style.setProperty('--hero-pointer-y', `${pointerY.toFixed(2)}px`);
    };

    const handlePointerMove = (event) => {
        if (!hero || !finePointer?.matches || !heroIsVisible || document.hidden) return;
        const rect = hero.getBoundingClientRect();
        pointerX = Math.max(-8, Math.min(8, ((event.clientX - rect.left) / rect.width - 0.5) * 16));
        pointerY = Math.max(-6, Math.min(6, ((event.clientY - rect.top) / rect.height - 0.5) * 12));
        if (!pointerFrame) pointerFrame = requestAnimationFrame(paintPointer);
    };

    const heroObserver = hero && 'IntersectionObserver' in window
        ? new IntersectionObserver(([entry]) => {
            heroIsVisible = Boolean(entry?.isIntersecting);
            if (!heroIsVisible) resetPointer();
        }, { threshold: 0.01 })
        : null;

    if (hero && heroObserver) heroObserver.observe(hero);
    hero?.addEventListener('pointermove', handlePointerMove, { passive: true });
    hero?.addEventListener('pointerleave', resetPointer, { passive: true });
    document.addEventListener('visibilitychange', resetPointer);

    return () => {
        revealObserver?.disconnect();
        heroObserver?.disconnect();
        hero?.removeEventListener('pointermove', handlePointerMove);
        hero?.removeEventListener('pointerleave', resetPointer);
        document.removeEventListener('visibilitychange', resetPointer);
        if (pointerFrame) cancelAnimationFrame(pointerFrame);
    };
}
