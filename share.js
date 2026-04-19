(function () {
    function sanitizeFileName(name) {
        return String(name || 'latest_tv')
            .replace(/[\\/:*?"<>|]+/g, '_')
            .replace(/\s+/g, '_')
            .slice(0, 80);
    }

    async function loadImageForShare(src) {
        // Attempt 1: Add a cache-buster timestamp. 
        // This solves the common issue where a previously cached DOM image (non-cors)
        // instantly triggers an error when fetched by canvas (cors).
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
            // Attempt 2: Use WESERV proxy to bypass CORS/403 blocks from strict servers (e.g. Douban)
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

        // Handle ellipsis for last line if truncated
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

            // 1. Calculate Heights
            let posterDrawH = 0;
            if (posterImage) {
                posterDrawH = posterImage.height * (ticketW / posterImage.width);
            }

            // Defines where the punched holes and division lines will be located
            const punchY = Math.max(
                ticketY + 200,
                posterDrawH > 0 ? ticketY + posterDrawH - 120 : ticketY + 200
            );

            let cursorY = punchY + 60;

            // Off-screen canvas to measure text heights
            const dctx = document.createElement('canvas').getContext('2d');

            dctx.font = '800 46px "Nunito Sans", sans-serif';
            cursorY += wrapShareText(dctx, item.title || '未命名', 0, 0, metaW, 56, Infinity, true) * 56 + 10;

            if (item.subtitle) {
                dctx.font = '600 24px "Nunito Sans", sans-serif';
                cursorY += wrapShareText(dctx, item.subtitle, 0, 0, metaW, 34, Infinity, true) * 34 + 10;
            }
            cursorY += 10;

            cursorY += 34; // Rating
            cursorY += 34; // Date
            const typeStr = getVisibleGenresForShare(item).map(g => window.appContext && window.appContext.getGenreDisplayName ? window.appContext.getGenreDisplayName(g) : g).slice(0, 4).join(' · ');
            if (typeStr) cursorY += 34; // Type

            cursorY += 40;

            dctx.font = '500 22px "Nunito Sans", sans-serif';
            if (item.directors && item.directors.length > 0) {
                const dirStr = `导演: ${item.directors.join(' / ')}`;
                cursorY += wrapShareText(dctx, dirStr, 0, 0, metaW, 34, Infinity, true) * 34;
            }
            if (item.actors && item.actors.length > 0) {
                const actorStr = `主演: ${item.actors.slice(0, 8).join(' / ')}`;
                cursorY += wrapShareText(dctx, actorStr, 0, 0, metaW, 34, Infinity, true) * 34;
            }

            cursorY += 40;

            dctx.font = '400 22px "Nunito Sans", sans-serif';
            if (item.overview) {
                cursorY += wrapShareText(dctx, item.overview, 0, 0, metaW, 42, Infinity, true) * 42;
            }

            // Footer Space
            cursorY += 120;
            const height = Math.ceil(cursorY + ticketMargin);
            const ticketH = height - ticketMargin * 2;

            // 2. Rendering Phase
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (!ctx) throw new Error('无法创建分享画布');

            // Dark outer background
            ctx.fillStyle = '#05080f';
            ctx.fillRect(0, 0, width, height);

            // Light Cream Ticket Background
            ctx.fillStyle = creamColor;
            ctx.beginPath();
            ctx.roundRect(ticketX, ticketY, ticketW, ticketH, 20);
            ctx.fill();

            // Draw Poster overlapping top portion
            if (posterImage) {
                ctx.save();
                ctx.beginPath();
                ctx.roundRect(ticketX, ticketY, ticketW, punchY - ticketY, [20, 20, 0, 0]);
                ctx.clip();

                ctx.drawImage(posterImage, ticketX, ticketY, ticketW, posterDrawH);

                // Gradient mask to blend poster into the cream background perfectly
                const gradient = ctx.createLinearGradient(0, punchY - 260, 0, punchY + 2);
                gradient.addColorStop(0, 'rgba(241, 240, 234, 0)');
                gradient.addColorStop(0.8, 'rgba(241, 240, 234, 0.9)');
                gradient.addColorStop(1, creamColor);
                ctx.fillStyle = gradient;
                ctx.fillRect(ticketX, punchY - 260, ticketW, 262);
                ctx.restore();
            }

            // The top headers ("极客视界 // GEEK RADAR" and "// 剧集档案") have been removed to keep the minimal look

            // Punched holes & Dashed dividing line
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

            // Draw Text Layout
            cursorY = punchY + 60;

            // Title
            ctx.textAlign = 'left';
            ctx.fillStyle = '#111318';
            ctx.font = '800 46px "Nunito Sans", "Microsoft YaHei", sans-serif';
            const titleLines = wrapShareText(ctx, item.title || '未命名', metaX, cursorY, metaW, 56, Infinity);
            cursorY += titleLines * 56 + 10;

            // Subtitle
            if (item.subtitle) {
                ctx.fillStyle = '#555964';
                ctx.font = '600 24px "Nunito Sans", "Microsoft YaHei", sans-serif';
                const subLines = wrapShareText(ctx, item.subtitle, metaX, cursorY, metaW, 34, Infinity);
                cursorY += subLines * 34 + 10;
            }

            cursorY += 10;

            // Meta Details
            ctx.fillStyle = '#333742';
            ctx.font = '600 20px "Fira Code", "Microsoft YaHei", monospace';
            const ratingStr = item.doubanVerified && item.doubanRating ? `豆瓣评分: ${item.doubanRating}` : '豆瓣评分: 暂无';
            const dateStr = item.date ? `上映时间: ${item.date}` : '上映时间: UNKNOWN';

            ctx.textAlign = 'left';
            ctx.fillText(ratingStr, metaX, cursorY);
            ctx.textAlign = 'right';
            ctx.fillText(dateStr, ticketX + ticketW - 40, cursorY);

            cursorY += 34;
            if (typeStr) {
                ctx.textAlign = 'left';
                ctx.fillText(`作品分类: ${typeStr}`, metaX, cursorY);
            }

            cursorY += 60;

            // Cast & Crew
            ctx.textAlign = 'left';
            ctx.fillStyle = '#333742';
            ctx.font = '500 22px "Nunito Sans", "Microsoft YaHei", sans-serif';
            if (item.directors && item.directors.length > 0) {
                const dirStr = `导演: ${item.directors.join(' / ')}`;
                const count = wrapShareText(ctx, dirStr, metaX, cursorY, metaW, 34, Infinity);
                cursorY += count * 34;
            }
            if (item.actors && item.actors.length > 0) {
                const actorStr = `主演: ${item.actors.slice(0, 8).join(' / ')}`;
                const count = wrapShareText(ctx, actorStr, metaX, cursorY + 4, metaW, 34, Infinity);
                cursorY += count * 34 + 10;
            }

            cursorY += 30;

            // Overview Text (No truncation limit!)
            ctx.fillStyle = '#555964';
            ctx.font = '400 22px "Nunito Sans", "Microsoft YaHei", sans-serif';
            if (item.overview) {
                wrapShareText(ctx, item.overview, metaX, cursorY + 20, metaW, 42, Infinity);
            }

            // Footer / Barcode part
            const bottomY = height - ticketMargin - 50;

            ctx.fillStyle = '#111318';
            let bcX = metaX;
            // Generate random-looking barcode lines
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
                const blob = await new Promise((resolve, reject) => {
                    canvas.toBlob((result) => {
                        if (!result) return reject(new Error('生成图片失败'));
                        resolve(result);
                    }, 'image/png', 0.95);
                });

                return new File([blob], `share_${item.id}.png`, { type: 'image/png' });
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

    function showImageOverlay(file) {
        const url = URL.createObjectURL(file);
        
        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed; top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(0, 0, 0, 0.9);
            backdrop-filter: blur(8px);
            z-index: 999999;
            display: flex; flex-direction: column; align-items: center; justify-content: center;
            padding: 20px;
            animation: fadeIn 0.3s ease;
        `;

        const hint = document.createElement('div');
        hint.textContent = '长按图片保存，或发送给朋友';
        hint.style.cssText = `
            color: #00f0ff; font-weight: 700; font-size: 16px; margin-bottom: 24px;
            text-shadow: 0 0 10px rgba(0,240,255,0.5); letter-spacing: 1px;
        `;

        const img = document.createElement('img');
        img.src = url;
        img.style.cssText = `
            max-width: 100%; max-height: 75vh;
            border-radius: 12px; box-shadow: 0 10px 40px rgba(0, 0, 0, 0.8);
            object-fit: contain; pointer-events: auto; user-select: auto;
            -webkit-touch-callout: default;
        `;

        const closeBtn = document.createElement('button');
        closeBtn.innerHTML = '×';
        closeBtn.style.cssText = `
            position: absolute; top: 30px; right: 30px;
            width: 44px; height: 44px; border-radius: 50%;
            background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2);
            color: white; font-size: 32px; line-height: 1;
            display: flex; align-items: center; justify-content: center;
            cursor: pointer; padding-bottom: 4px;
        `;

        closeBtn.onclick = () => {
            document.body.removeChild(overlay);
            URL.revokeObjectURL(url);
        };

        overlay.onclick = (e) => {
            if (e.target === overlay) closeBtn.onclick();
        };

        if (!document.getElementById('share-overlay-keyframes')) {
            const style = document.createElement('style');
            style.id = 'share-overlay-keyframes';
            style.textContent = '@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }';
            document.head.appendChild(style);
        }

        overlay.appendChild(closeBtn);
        overlay.appendChild(hint);
        overlay.appendChild(img);
        document.body.appendChild(overlay);
    }

    async function shareItem(currentDossierItem) {
        const showToast = window.appContext ? window.appContext.showToast : console.log;
        try {
            const file = await createShareImageFile(currentDossierItem);
            const shareText = buildShareText(currentDossierItem);
            const shareData = {
                title: currentDossierItem.title || 'latest_tv',
                text: shareText,
                files: [file]
            };

            const isWeChat = /MicroMessenger/i.test(navigator.userAgent);
            
            if (!isWeChat) {
                const canShareFiles = typeof navigator.canShare === 'function' ? navigator.canShare({ files: [file] }) : true;
                if (navigator.share && canShareFiles) {
                    await navigator.share(shareData);
                    showToast('已打开系统分享');
                    return;
                }
            }

            const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
            
            if (isWeChat || isMobile) {
                showImageOverlay(file);
                showToast('已生成分享图');
            } else {
                triggerDownload(file);
                showToast('大图已开始下载');
            }
        } catch (error) {
            console.error('分享失败:', error);
            showToast('分享失败，已取消');
        }
    }

    // Expose functionality to global scope
    window.ShareModule = {
        shareItem
    };
})();
