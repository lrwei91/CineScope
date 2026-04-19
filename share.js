/**
 * 分享功能模块
 * 负责生成分享图片并处理系统分享
 */

function sanitizeFileName(name) {
    return String(name || 'latest_tv')
        .replace(/[\\/:*?"<>|]+/g, '_')
        .replace(/\s+/g, '_')
        .slice(0, 80);
}

async function loadImageForShare(src) {
    const cacheBuster = `t=${Date.now()}`;
    const urlWithBuster = src + (src.includes('?') ? '&' : '?') + cacheBuster;

    try {
        return await new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error('Direct load failed'));
            img.src = urlWithBuster;
        });
    } catch (err) {
        return await new Promise((resolve, reject) => {
            const proxyImg = new Image();
            proxyImg.crossOrigin = 'anonymous';
            proxyImg.onload = () => resolve(proxyImg);
            proxyImg.onerror = () => reject(new Error('Proxy load failed'));
            proxyImg.src = `https://images.weserv.nl/?url=${encodeURIComponent(src)}`;
        });
    }
}

function wrapShareText(ctx, text, x, y, maxWidth, lineHeight, maxLines = Infinity, dryRun = false) {
    if (!text) return 0;
    const paragraphs = String(text).split(/\n/);
    const lines = [];

    for (const paragraph of paragraphs) {
        let currentLine = '';
        for (let i = 0; i < paragraph.length; i++) {
            const char = paragraph[i];
            const testLine = currentLine + char;
            const metrics = ctx.measureText(testLine);

            if (metrics.width > maxWidth && currentLine.length > 0) {
                lines.push(currentLine);
                currentLine = char;
            } else {
                currentLine = testLine;
            }
        }
        if (currentLine) {
            lines.push(currentLine);
        }
    }

    const linesToRender = lines.slice(0, maxLines);

    if (lines.length > maxLines) {
        const lastIdx = linesToRender.length - 1;
        let lastLine = linesToRender[lastIdx];
        const ellipsis = '...';

        while (lastLine.length > 0 && ctx.measureText(lastLine + ellipsis).width > maxWidth) {
            lastLine = lastLine.slice(0, -1);
        }
        linesToRender[lastIdx] = lastLine + ellipsis;
    }

    if (!dryRun) {
        linesToRender.forEach((line, index) => {
            ctx.fillText(line, x, y + index * lineHeight);
        });
    }

    return linesToRender.length;
}

function clampText(text, maxLength) {
    const value = String(text || '').trim();
    if (value.length <= maxLength) return value;
    return `${value.slice(0, maxLength - 1)}…`;
}

function getVisibleGenresForShare(item) {
    const HIDDEN_GENRES = window.appContext ? window.appContext.HIDDEN_GENRES : new Set();
    const getGenreDisplayName = window.appContext ? window.appContext.getGenreDisplayName : (g => g);
    return (item.genres || []).filter((genreName) => {
        const displayName = getGenreDisplayName(genreName);
        return !HIDDEN_GENRES.has(displayName) && !HIDDEN_GENRES.has(genreName);
    });
}

function buildShareText(item) {
    const getGenreDisplayName = window.appContext ? window.appContext.getGenreDisplayName : (g => g);
    const visibleGenres = getVisibleGenresForShare(item).map((genre) => getGenreDisplayName(genre));
    const lines = [
        item.title || '未命名',
        item.subtitle ? item.subtitle : '',
        item.doubanVerified && item.doubanRating ? `评分：${item.doubanRating}` : '评分：暂无',
        item.date ? `上映：${item.date}` : '上映：UNKNOWN',
        visibleGenres.length > 0 ? `类型：${visibleGenres.join(' / ')}` : ''
    ].filter(Boolean);

    if (item.overview) {
        lines.push(`简介：${clampText(item.overview, 300)}`);
    }

    lines.push(window.location.href);
    return lines.join('\n');
}

async function createShareImageFile(item) {
    const width = 840;
    let includePoster = Boolean(item.posterPath);
    const ticketMargin = 40;
    const ticketW = width - ticketMargin * 2;
    const ticketX = ticketMargin;
    const ticketY = ticketMargin;
    const metaX = ticketX + 40;
    const metaW = ticketW - 80;

    const creamColor = '#f1f0ea';
    let posterImage = null;

    for (let attempt = 0; attempt < 2; attempt += 1) {
        if (includePoster && item.posterPath && !posterImage) {
            try {
                const resolvePosterUrl = window.appContext ? window.appContext.resolvePosterUrl : (p => p);
                posterImage = await loadImageForShare(resolvePosterUrl(item.posterPath));
            } catch (error) {
                includePoster = false;
            }
        }

        let posterDrawH = 0;
        if (posterImage) {
            posterDrawH = posterImage.height * (ticketW / posterImage.width);
        }

        const punchY = Math.max(
            ticketY + 200,
            posterDrawH > 0 ? ticketY + posterDrawH - 120 : ticketY + 200
        );

        let cursorY = punchY + 60;
        const dctx = document.createElement('canvas').getContext('2d');

        dctx.font = '800 46px "Nunito Sans", sans-serif';
        cursorY += wrapShareText(dctx, item.title || '未命名', 0, 0, metaW, 56, Infinity, true) * 56 + 10;

        if (item.subtitle) {
            dctx.font = '600 24px "Nunito Sans", sans-serif';
            cursorY += wrapShareText(dctx, item.subtitle, 0, 0, metaW, 34, Infinity, true) * 34 + 10;
        }
        cursorY += 10;

        cursorY += 34;
        cursorY += 34;
        const typeStr = getVisibleGenresForShare(item).map(g => window.appContext && window.appContext.getGenreDisplayName ? window.appContext.getGenreDisplayName(g) : g).slice(0, 4).join(' · ');
        if (typeStr) cursorY += 34;

        cursorY += 40;

        dctx.font = '500 22px "Nunito Sans", sans-serif';
        if (item.directors && item.directors.length > 0) {
            const dirStr = `导演：${item.directors.join(' / ')}`;
            cursorY += wrapShareText(dctx, dirStr, 0, 0, metaW, 34, Infinity, true) * 34;
        }
        if (item.actors && item.actors.length > 0) {
            const actorStr = `主演：${item.actors.slice(0, 8).join(' / ')}`;
            cursorY += wrapShareText(dctx, actorStr, 0, 0, metaW, 34, Infinity, true) * 34;
        }

        cursorY += 40;

        dctx.font = '400 22px "Nunito Sans", sans-serif';
        if (item.overview) {
            cursorY += wrapShareText(dctx, item.overview, 0, 0, metaW, 42, Infinity, true) * 42;
        }

        cursorY += 120;
        const height = Math.ceil(cursorY + ticketMargin);
        const ticketH = height - ticketMargin * 2;

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('无法创建分享画布');

        ctx.fillStyle = '#05080f';
        ctx.fillRect(0, 0, width, height);

        ctx.fillStyle = creamColor;
        ctx.beginPath();
        ctx.roundRect(ticketX, ticketY, ticketW, ticketH, 20);
        ctx.fill();

        if (posterImage) {
            ctx.save();
            ctx.beginPath();
            ctx.roundRect(ticketX, ticketY, ticketW, punchY - ticketY, [20, 20, 0, 0]);
            ctx.clip();

            ctx.drawImage(posterImage, ticketX, ticketY, ticketW, posterDrawH);

            const gradient = ctx.createLinearGradient(0, punchY - 260, 0, punchY + 2);
            gradient.addColorStop(0, 'rgba(241, 240, 234, 0)');
            gradient.addColorStop(0.8, 'rgba(241, 240, 234, 0.9)');
            gradient.addColorStop(1, creamColor);
            ctx.fillStyle = gradient;
            ctx.fillRect(ticketX, punchY - 260, ticketW, 262);
            ctx.restore();
        }

        const holeRadius = 24;
        ctx.globalCompositeOperation = 'destination-out';
        ctx.beginPath();
        ctx.arc(ticketX, punchY, holeRadius, 0, Math.PI * 2);
        ctx.arc(ticketX + ticketW, punchY, holeRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalCompositeOperation = 'source-over';

        ctx.beginPath();
        ctx.setLineDash([8, 12]);
        ctx.strokeStyle = '#c4c3bd';
        ctx.lineWidth = 2;
        ctx.moveTo(ticketX + holeRadius + 10, punchY);
        ctx.lineTo(ticketX + ticketW - holeRadius - 10, punchY);
        ctx.stroke();
        ctx.setLineDash([]);

        cursorY = punchY + 60;

        ctx.textAlign = 'left';
        ctx.fillStyle = '#111318';
        ctx.font = '800 46px "Nunito Sans", "Microsoft YaHei", sans-serif';
        const titleLines = wrapShareText(ctx, item.title || '未命名', metaX, cursorY, metaW, 56, Infinity);
        cursorY += titleLines * 56 + 10;

        if (item.subtitle) {
            ctx.fillStyle = '#555964';
            ctx.font = '600 24px "Nunito Sans", "Microsoft YaHei", sans-serif';
            const subLines = wrapShareText(ctx, item.subtitle, metaX, cursorY, metaW, 34, Infinity);
            cursorY += subLines * 34 + 10;
        }

        cursorY += 10;

        ctx.fillStyle = '#333742';
        ctx.font = '600 20px "Fira Code", "Microsoft YaHei", monospace';
        const ratingStr = item.doubanVerified && item.doubanRating ? `豆瓣评分：${item.doubanRating}` : '豆瓣评分：暂无';
        const dateStr = item.date ? `上映时间：${item.date}` : '上映时间：UNKNOWN';

        ctx.textAlign = 'left';
        ctx.fillText(ratingStr, metaX, cursorY);
        ctx.textAlign = 'right';
        ctx.fillText(dateStr, ticketX + ticketW - 40, cursorY);

        cursorY += 34;
        if (typeStr) {
            ctx.textAlign = 'left';
            ctx.fillText(`作品分类：${typeStr}`, metaX, cursorY);
        }

        cursorY += 60;

        ctx.textAlign = 'left';
        ctx.fillStyle = '#333742';
        ctx.font = '500 22px "Nunito Sans", "Microsoft YaHei", sans-serif';
        if (item.directors && item.directors.length > 0) {
            const dirStr = `导演：${item.directors.join(' / ')}`;
            const count = wrapShareText(ctx, dirStr, metaX, cursorY, metaW, 34, Infinity);
            cursorY += count * 34;
        }
        if (item.actors && item.actors.length > 0) {
            const actorStr = `主演：${item.actors.slice(0, 8).join(' / ')}`;
            const count = wrapShareText(ctx, actorStr, metaX, cursorY + 4, metaW, 34, Infinity);
            cursorY += count * 34 + 10;
        }

        cursorY += 30;

        ctx.fillStyle = '#555964';
        ctx.font = '400 22px "Nunito Sans", "Microsoft YaHei", sans-serif';
        if (item.overview) {
            wrapShareText(ctx, item.overview, metaX, cursorY + 20, metaW, 42, Infinity);
        }

        const bottomY = height - ticketMargin - 50;

        ctx.fillStyle = '#111318';
        let bcX = metaX;
        for (let i = 0; i < 26; i++) {
            const rand = Math.sin((item.id || 1) * (i + 1));
            const barW = rand > 0.5 ? 4 : (rand > 0 ? 8 : 2);
            ctx.fillRect(bcX, bottomY - 36, barW, 40);
            bcX += barW + 4;
        }

        ctx.font = '500 14px "Fira Code", monospace';
        ctx.fillStyle = '#888d96';
        const idStr = `LRWEI91-${(item.date || '').replace(/-/g, '')}-0001`;
        ctx.fillText(idStr, metaX, bottomY + 26);

        ctx.textAlign = 'right';
        ctx.fillStyle = '#c6211a';
        ctx.font = '800 24px "Fira Code", "Microsoft YaHei", monospace';
        ctx.fillText('CONFIDENTIAL', ticketX + ticketW - 40, bottomY - 14);

        ctx.fillStyle = '#888d96';
        ctx.font = '400 16px "Fira Code", monospace';
        ctx.fillText('https://lrwei91.github.io/latest_tv/', ticketX + ticketW - 40, bottomY + 24);

        try {
            const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
            const blob = await new Promise((resolve, reject) => {
                canvas.toBlob((result) => {
                    if (!result) return reject(new Error('生成图片失败'));
                    resolve(result);
                }, 'image/jpeg', 0.92);
            });
            const file = new File([blob], `share_${item.id}.jpg`, { type: 'image/jpeg' });
            return { dataUrl, file };
        } catch (error) {
            if (attempt === 0 && includePoster) {
                console.warn('Canvas toBlob failed (likely CORS). Retrying without poster image.');
                includePoster = false;
                continue;
            }
            throw error;
        }
    }
    throw new Error('无法生成分享图片');
}

function triggerDownload(file) {
    const url = URL.createObjectURL(file);
    const link = document.createElement('a');
    link.href = url;
    link.download = file.name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
}

function showImageOverlay(dataUrl) {
    const overlay = document.createElement('div');
    overlay.style.cssText = `
        position: fixed; top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(0, 0, 0, 0.9);
        z-index: 999999;
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        padding: 20px;
        animation: fadeIn 0.3s ease;
        -webkit-overflow-scrolling: touch;
    `;

    const hint = document.createElement('div');
    hint.textContent = '↓ 长按图片，选择「存入手机」或「发送给朋友」';
    hint.style.cssText = `
        color: #ffffff; font-weight: 600; font-size: 15px; margin-bottom: 18px;
        background: rgba(0,240,255,0.15); border: 1px solid rgba(0,240,255,0.3);
        padding: 10px 18px; border-radius: 8px; letter-spacing: 0.5px;
        text-align: center; line-height: 1.5;
    `;

    const img = document.createElement('img');
    img.src = dataUrl;
    img.style.cssText = `
        max-width: 100%; max-height: 70vh;
        border-radius: 12px; box-shadow: 0 10px 40px rgba(0, 0, 0, 0.8);
        object-fit: contain; display: block;
        pointer-events: auto;
        -webkit-touch-callout: default !important;
        user-select: auto;
    `;
    img.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });

    const closeBtn = document.createElement('button');
    closeBtn.textContent = '✕ 关闭';
    closeBtn.style.cssText = `
        margin-top: 20px;
        padding: 10px 32px; border-radius: 20px;
        background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.25);
        color: rgba(255,255,255,0.8); font-size: 15px;
        cursor: pointer; letter-spacing: 1px;
    `;

    const cleanup = () => {
        if (document.body.contains(overlay)) document.body.removeChild(overlay);
    };
    closeBtn.onclick = cleanup;
    overlay.onclick = (e) => { if (e.target === overlay) cleanup(); };

    if (!document.getElementById('share-overlay-keyframes')) {
        const style = document.createElement('style');
        style.id = 'share-overlay-keyframes';
        style.textContent = '@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }';
        document.head.appendChild(style);
    }

    overlay.appendChild(hint);
    overlay.appendChild(img);
    overlay.appendChild(closeBtn);
    document.body.appendChild(overlay);
}

async function shareItem(currentDossierItem) {
    const showToast = window.appContext ? window.appContext.showToast : console.log;
    try {
        const result = await createShareImageFile(currentDossierItem);
        const { dataUrl, file } = result;

        const isWeChat = /MicroMessenger/i.test(navigator.userAgent);
        const isMobile = /Android|webOS|iPhone|iPad|iPod/i.test(navigator.userAgent);

        if (isWeChat) {
            showImageOverlay(dataUrl);
            showToast('已生成分享图，长按保存或转发');
            return;
        }

        const canShareFiles = typeof navigator.canShare === 'function' ? navigator.canShare({ files: [file] }) : false;
        if (navigator.share && canShareFiles) {
            const shareText = buildShareText(currentDossierItem);
            await navigator.share({ title: currentDossierItem.title || 'latest_tv', text: shareText, files: [file] });
            showToast('已打开系统分享');
            return;
        }

        if (isMobile) {
            showImageOverlay(dataUrl);
            showToast('已生成分享图，长按保存');
            return;
        }

        triggerDownload(file);
        showToast('大图已开始下载');
    } catch (error) {
        console.error('分享失败:', error);
        showToast('分享失败，已取消');
    }
}

export const ShareModule = {
    shareItem
};
