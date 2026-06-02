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

    if (!enabled || window.innerWidth <= 900) return;

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
 * 打字机效果
 * 动画过程中先把元素 aria-hidden（避免屏幕阅读器朗读乱码中间态），
 * 解密完成后清掉 aria-hidden，由屏幕阅读器自然读出最终结果。
 */
export function typeWriterEffect(element, text, speed = 30) {
    if (!element) return;
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#%&*+<>-=';
    let iterations = 0;
    clearInterval(element.dataset.typingInterval);

    element.setAttribute('aria-hidden', 'true');
    element.dataset.typingInterval = setInterval(() => {
        element.textContent = text.split('').map((letter, index) => {
            if (index < iterations) {
                return text[index];
            }
            return chars[Math.floor(Math.random() * chars.length)];
        }).join('');

        if (iterations >= text.length) {
            clearInterval(element.dataset.typingInterval);
            element.removeAttribute('aria-hidden');
        }
        iterations += 1 / 2;
    }, speed);
}

/**
 * 返回顶部按钮控制
 */
export function setupBackToTop(button) {
    if (!button) return;

    let scrollTimeout;
    window.addEventListener('scroll', () => {
        clearTimeout(scrollTimeout);
        scrollTimeout = setTimeout(() => {
            if (window.scrollY > 600) {
                button.classList.add('visible');
                button.hidden = false;
            } else {
                button.classList.remove('visible');
                button.hidden = true;
            }
        }, 50);
    });

    button.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });
}
