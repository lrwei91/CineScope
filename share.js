/**
 * 分享功能模块
 * 负责生成分享图片并处理系统分享
 */

const QR_CODE_SIZE = 132;
const QR_CODE_API_BASE_URL = 'https://api.qrserver.com/v1/create-qr-code/';
const BOTTOM_SECTION_GAP = 56;
const QR_CARD_PADDING = 16;
const QR_CARD_HEADER_HEIGHT = 28;
const QR_CONTENT_SHIFT_Y = 8;
const QR_CARD_FOOTER_PADDING = 14;
const REALTIME_CARD_HEIGHT = 88;
const REALTIME_CARD_GAP = 12;

export function getShareBaseUrl(locationLike = globalThis.location) {
    if (!locationLike?.href) {
        return '/';
    }

    try {
        const currentUrl = new URL(locationLike.href);
        currentUrl.search = '';
        currentUrl.hash = '';
        return currentUrl.toString();
    } catch {
        return '/';
    }
}

export function getQrCodeUrl(text, size = QR_CODE_SIZE) {
    const qrUrl = new URL(QR_CODE_API_BASE_URL);
    qrUrl.searchParams.set('size', `${size}x${size}`);
    qrUrl.searchParams.set('data', text);
    qrUrl.searchParams.set('margin', '0');
    return qrUrl.toString();
}

export function getShareQrCodeUrl(locationLike = globalThis.location, size = QR_CODE_SIZE) {
    return getQrCodeUrl(getShareBaseUrl(locationLike), size);
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

function getContainImageLayout(imageWidth, imageHeight, maxWidth, maxHeight) {
    if (!imageWidth || !imageHeight || !maxWidth || !maxHeight) {
        return null;
    }

    const scale = Math.min(maxWidth / imageWidth, maxHeight / imageHeight);
    const drawWidth = imageWidth * scale;
    const drawHeight = imageHeight * scale;

    return {
        drawWidth,
        drawHeight,
        offsetX: (maxWidth - drawWidth) / 2,
        offsetY: (maxHeight - drawHeight) / 2
    };
}

function getCoverImageLayout(imageWidth, imageHeight, targetWidth, targetHeight) {
    if (!imageWidth || !imageHeight || !targetWidth || !targetHeight) {
        return null;
    }

    const scale = Math.max(targetWidth / imageWidth, targetHeight / imageHeight);
    const drawWidth = imageWidth * scale;
    const drawHeight = imageHeight * scale;

    return {
        drawWidth,
        drawHeight,
        offsetX: (targetWidth - drawWidth) / 2,
        offsetY: (targetHeight - drawHeight) / 2
    };
}

function getVisibleGenresForShare(item) {
    const HIDDEN_GENRES = window.appContext ? window.appContext.HIDDEN_GENRES : new Set();
    const getGenreDisplayName = window.appContext ? window.appContext.getGenreDisplayName : (g => g);
    return (item.genres || []).filter((genreName) => {
        const displayName = getGenreDisplayName(genreName);
        return !HIDDEN_GENRES.has(displayName) && !HIDDEN_GENRES.has(genreName);
    });
}

function compactMetricValue(value) {
    return String(value || '').trim() || '暂无';
}

export function getShareRealtimeMetrics(item) {
    if (item?.kind === 'movie' && item.boxOffice) {
        const boxOffice = item.boxOffice;
        const rankLabel = boxOffice.rank ? `#${boxOffice.rank}` : '实时';
        return [
            {
                label: `票房 ${rankLabel}`,
                value: compactMetricValue(boxOffice.realTimeBoxOffice || boxOffice.cumulativeBoxOffice),
                detail: [boxOffice.boxOfficeRate ? `占比 ${boxOffice.boxOfficeRate}` : '', boxOffice.showCountRate ? `排片 ${boxOffice.showCountRate}` : '']
                    .filter(Boolean)
                    .join(' · ')
            }
        ];
    }

    if (item?.kind === 'tv' && item.tvHeat) {
        const tvHeat = item.tvHeat;
        const rankLabel = tvHeat.rank ? `#${tvHeat.rank}` : '实时';
        return [
            {
                label: `热度 ${rankLabel}`,
                value: compactMetricValue(tvHeat.currHeatDesc || tvHeat.currHeat),
                detail: [tvHeat.platformDesc, tvHeat.releaseInfo].filter(Boolean).join(' · ')
            }
        ];
    }

    return [];
}

function buildShareText(item) {
    const getGenreDisplayName = window.appContext ? window.appContext.getGenreDisplayName : (g => g);
    const visibleGenres = getVisibleGenresForShare(item).map((genre) => getGenreDisplayName(genre));
    const realtimeMetrics = getShareRealtimeMetrics(item);
    const lines = [
        item.title || '未命名',
        item.subtitle ? item.subtitle : '',
        item.doubanVerified && item.doubanRating ? `评分：${item.doubanRating}` : '评分：暂无',
        item.date ? `上映：${item.date}` : '上映：UNKNOWN',
        visibleGenres.length > 0 ? `类型：${visibleGenres.join(' / ')}` : '',
        ...realtimeMetrics.map((metric) =>
            `${metric.label}：${metric.value}${metric.detail ? `（${metric.detail}）` : ''}`
        )
    ].filter(Boolean);

    if (item.overview) {
        lines.push(`简介：${clampText(item.overview, 300)}`);
    }

    lines.push(getShareBaseUrl());
    return lines.join('\n');
}

function drawRealtimeMetrics(ctx, metrics, x, y, width) {
    const cardCount = Math.max(1, metrics.length);
    const cardWidth = (width - REALTIME_CARD_GAP * (cardCount - 1)) / cardCount;

    metrics.forEach((metric, index) => {
        const cardX = x + index * (cardWidth + REALTIME_CARD_GAP);
        const accentGradient = ctx.createLinearGradient(cardX, y, cardX + cardWidth, y);
        accentGradient.addColorStop(0, '#111318');
        accentGradient.addColorStop(1, '#343844');

        ctx.fillStyle = accentGradient;
        ctx.beginPath();
        ctx.roundRect(cardX, y, cardWidth, REALTIME_CARD_HEIGHT, 16);
        ctx.fill();

        ctx.fillStyle = '#d9f7ff';
        ctx.font = '800 18px "Fira Code", "Microsoft YaHei", monospace';
        ctx.textAlign = 'left';
        ctx.fillText(metric.label, cardX + 22, y + 31);

        ctx.fillStyle = '#ffffff';
        ctx.font = '900 30px "Nunito Sans", "Microsoft YaHei", sans-serif';
        ctx.fillText(clampText(metric.value, 10), cardX + 22, y + 64);

        if (metric.detail) {
            ctx.fillStyle = '#b7bcc8';
            ctx.font = '600 16px "Nunito Sans", "Microsoft YaHei", sans-serif';
            ctx.textAlign = 'right';
            ctx.fillText(clampText(metric.detail, 24), cardX + cardWidth - 22, y + 64);
        }
    });
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
    let shareQrCodeImage = null;
    let doubanQrCodeImage = null;
    const hasDoubanLink = Boolean(item.doubanLink);
    const qrBlockHeight = QR_CARD_HEADER_HEIGHT + QR_CARD_PADDING + QR_CODE_SIZE + QR_CONTENT_SHIFT_Y + QR_CARD_FOOTER_PADDING;

    try {
        shareQrCodeImage = await loadImageForShare(getShareQrCodeUrl());
    } catch (error) {
        console.warn('Share QR code load failed. Rendering share image without share QR code.', error);
    }

    if (hasDoubanLink) {
        try {
            doubanQrCodeImage = await loadImageForShare(getQrCodeUrl(item.doubanLink));
        } catch (error) {
            console.warn('Douban QR code load failed. Rendering share image without Douban QR code.', error);
        }
    }

    for (let attempt = 0; attempt < 2; attempt += 1) {
        if (includePoster && item.posterPath && !posterImage) {
            try {
                const resolvePosterUrl = window.appContext ? window.appContext.resolvePosterUrl : (p => p);
                posterImage = await loadImageForShare(resolvePosterUrl(item.posterPath));
            } catch (error) {
                includePoster = false;
            }
        }

        const typeStr = getVisibleGenresForShare(item).map(g => window.appContext && window.appContext.getGenreDisplayName ? window.appContext.getGenreDisplayName(g) : g).slice(0, 4).join(' · ');
        
        let heroH = 480;
        const dctx = document.createElement('canvas').getContext('2d');
        
        if (!posterImage) {
            let textH = 60;
            dctx.font = '800 46px "Nunito Sans", sans-serif';
            textH += wrapShareText(dctx, item.title || '未命名', 0, 0, metaW, 60, 3, true) * 60 + 10;
            if (item.subtitle) {
                dctx.font = '600 22px "Nunito Sans", sans-serif';
                textH += wrapShareText(dctx, item.subtitle, 0, 0, metaW, 34, 2, true) * 34 + 20;
            } else {
                textH += 20;
            }
            textH += 40 + 40 + 40;
            heroH = textH + 60;
        }

        const punchY = ticketY + heroH;
        let cursorY = punchY + 40;

        const realtimeMetrics = getShareRealtimeMetrics(item);
        if (realtimeMetrics.length > 0) {
            cursorY += REALTIME_CARD_HEIGHT + 34;
        }

        dctx.font = '500 22px "Nunito Sans", sans-serif';
        let hasCrew = false;
        if (item.directors && item.directors.length > 0) {
            hasCrew = true;
            const dirStr = `导演：${item.directors.join(' / ')}`;
            cursorY += wrapShareText(dctx, dirStr, 0, 0, metaW, 34, Infinity, true) * 34;
        }
        if (item.actors && item.actors.length > 0) {
            hasCrew = true;
            const actorStr = `主演：${item.actors.slice(0, 8).join(' / ')}`;
            cursorY += wrapShareText(dctx, actorStr, 0, 0, metaW, 34, Infinity, true) * 34;
        }

        if (hasCrew) cursorY += 24;

        dctx.font = '400 22px "Nunito Sans", sans-serif';
        if (item.overview) {
            cursorY += wrapShareText(dctx, item.overview, 0, 0, metaW, 40, Infinity, true) * 40;
        }

        cursorY += BOTTOM_SECTION_GAP + qrBlockHeight + 50;
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

        ctx.save();
        ctx.beginPath();
        ctx.roundRect(ticketX, ticketY, ticketW, heroH, [20, 20, 0, 0]);
        ctx.clip();

        if (posterImage) {
            const bgLayout = getCoverImageLayout(posterImage.width, posterImage.height, ticketW, heroH);
            if (bgLayout) {
                ctx.filter = 'blur(30px) brightness(0.4)';
                ctx.drawImage(
                    posterImage,
                    ticketX + bgLayout.offsetX - 40,
                    ticketY + bgLayout.offsetY - 40,
                    bgLayout.drawWidth + 80,
                    bgLayout.drawHeight + 80
                );
                ctx.filter = 'none';
            }
            
            ctx.fillStyle = 'rgba(10, 12, 18, 0.4)';
            ctx.fillRect(ticketX, ticketY, ticketW, heroH);

            const posterW = 240;
            const posterH = 426; // 9:16 新尺寸黄金比例 (240px 宽度对应 426px 高度)
            const posterX = ticketX + 40;
            const posterY = ticketY + (heroH - posterH) / 2;
            
            ctx.save();
            ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
            ctx.shadowBlur = 24;
            ctx.shadowOffsetY = 12;
            ctx.beginPath();
            ctx.roundRect(posterX, posterY, posterW, posterH, 12);
            ctx.fill();
            ctx.clip();
            
            const fgLayout = getCoverImageLayout(posterImage.width, posterImage.height, posterW, posterH);
            if (fgLayout) {
                ctx.drawImage(
                    posterImage,
                    posterX + fgLayout.offsetX,
                    posterY + fgLayout.offsetY,
                    fgLayout.drawWidth,
                    fgLayout.drawHeight
                );
            }
            ctx.restore();
        } else {
            const heroGradient = ctx.createLinearGradient(ticketX, ticketY, ticketX, punchY);
            heroGradient.addColorStop(0, '#1a1d25');
            heroGradient.addColorStop(1, '#10131a');
            ctx.fillStyle = heroGradient;
            ctx.fillRect(ticketX, ticketY, ticketW, heroH);
        }
        ctx.restore();

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

        let heroCursorY;
        const textX = posterImage ? ticketX + 316 : metaX;
        const textW = posterImage ? ticketW - 356 : metaW;
        
        if (posterImage) {
            heroCursorY = ticketY + 95;
        } else {
            heroCursorY = ticketY + 60;
        }

        ctx.textAlign = 'left';
        ctx.fillStyle = '#ffffff';
        ctx.font = '800 46px "Nunito Sans", "Microsoft YaHei", sans-serif';
        const titleLines = wrapShareText(ctx, item.title || '未命名', textX, heroCursorY, textW, 60, 3);
        heroCursorY += titleLines * 60 + 10;

        if (item.subtitle) {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
            ctx.font = '600 22px "Nunito Sans", "Microsoft YaHei", sans-serif';
            const subLines = wrapShareText(ctx, item.subtitle, textX, heroCursorY, textW, 34, 2);
            heroCursorY += subLines * 34 + 20;
        } else {
            heroCursorY += 20;
        }

        const drawMetaLine = (label, value) => {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
            ctx.font = '500 20px "Nunito Sans", "Microsoft YaHei", sans-serif';
            ctx.fillText(label, textX, heroCursorY);
            
            ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
            ctx.font = '700 22px "Fira Code", "Nunito Sans", "Microsoft YaHei", sans-serif';
            ctx.fillText(value, textX + 100, heroCursorY);
            
            heroCursorY += 40;
        };

        const ratingVal = item.doubanVerified && item.doubanRating ? item.doubanRating : '暂无';
        drawMetaLine('豆瓣评分', ratingVal);
        
        const dateVal = item.date ? item.date : 'UNKNOWN';
        drawMetaLine('上映时间', dateVal);

        if (typeStr) {
            drawMetaLine('作品分类', typeStr);
        }

        cursorY = punchY + 40;

        if (realtimeMetrics.length > 0) {
            drawRealtimeMetrics(ctx, realtimeMetrics, metaX, cursorY, metaW);
            cursorY += REALTIME_CARD_HEIGHT + 34;
        }

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
            cursorY += count * 34;
        }

        if (hasCrew) cursorY += 24;

        ctx.fillStyle = '#555964';
        ctx.font = '400 22px "Nunito Sans", "Microsoft YaHei", sans-serif';
        if (item.overview) {
            const overviewLineCount = wrapShareText(ctx, item.overview, metaX, cursorY + 10, metaW, 40, Infinity);
            cursorY += overviewLineCount * 40;
        }

        cursorY += BOTTOM_SECTION_GAP;
        const bottomSectionTop = cursorY;
        const qrGap = hasDoubanLink ? 24 : 0;
        const qrStartX = metaX;
        const qrCardWidth = QR_CODE_SIZE + QR_CARD_PADDING * 2;
        const primaryQrX = qrStartX;
        const secondaryQrX = qrStartX + qrCardWidth + qrGap;
        const qrY = bottomSectionTop;
        const qrInnerX = QR_CARD_PADDING;
        const qrInnerY = QR_CARD_HEADER_HEIGHT + QR_CARD_PADDING + QR_CONTENT_SHIFT_Y;

        const drawQrBlock = (image, x, headerLabel, fallbackText, accentColor) => {
            ctx.fillStyle = '#ece9df';
            ctx.beginPath();
            ctx.roundRect(x, qrY, qrCardWidth, qrBlockHeight, 14);
            ctx.fill();

            ctx.strokeStyle = '#d7d5cf';
            ctx.lineWidth = 1;
            ctx.stroke();

            ctx.fillStyle = accentColor;
            ctx.beginPath();
            ctx.roundRect(x + 10, qrY + 10, qrCardWidth - 20, QR_CARD_HEADER_HEIGHT, 8);
            ctx.fill();

            ctx.fillStyle = '#111318';
            ctx.font = '700 14px "Fira Code", "Microsoft YaHei", monospace';
            ctx.textAlign = 'center';
            ctx.fillText(headerLabel, x + (qrCardWidth / 2), qrY + 29);

            const imageX = x + qrInnerX;
            const imageY = qrY + qrInnerY;
            if (image) {
                ctx.drawImage(image, imageX, imageY, QR_CODE_SIZE, QR_CODE_SIZE);
                ctx.strokeStyle = '#d7d5cf';
                ctx.lineWidth = 1;
                ctx.strokeRect(imageX - 1, imageY - 1, QR_CODE_SIZE + 2, QR_CODE_SIZE + 2);
            } else {
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(imageX, imageY, QR_CODE_SIZE, QR_CODE_SIZE);
                ctx.strokeStyle = '#d7d5cf';
                ctx.lineWidth = 1;
                ctx.strokeRect(imageX, imageY, QR_CODE_SIZE, QR_CODE_SIZE);
                ctx.fillStyle = '#555964';
                ctx.font = '600 14px "Nunito Sans", "Microsoft YaHei", sans-serif';
                ctx.textAlign = 'center';
                wrapShareText(ctx, fallbackText, imageX + (QR_CODE_SIZE / 2), imageY + 60, QR_CODE_SIZE - 20, 20, 3);
            }
        };

        drawQrBlock(shareQrCodeImage, primaryQrX, '最新片单', 'SCAN TO OPEN', '#d9f7ff');
        if (hasDoubanLink) {
            drawQrBlock(doubanQrCodeImage, secondaryQrX, '豆瓣详情', 'OPEN DOUBAN', '#f7f1d9');
        }

        ctx.textAlign = 'right';
        ctx.fillStyle = '#c6211a';
        ctx.font = '800 24px "Fira Code", "Microsoft YaHei", monospace';
        ctx.fillText('CONFIDENTIAL', ticketX + ticketW - 40, qrY + qrBlockHeight);

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
            await navigator.share({ title: currentDossierItem.title || 'CineScope', text: shareText, files: [file] });
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

// 暴露到全局供 app.js 使用
if (typeof window !== 'undefined') {
    window.ShareModule = ShareModule;
}
