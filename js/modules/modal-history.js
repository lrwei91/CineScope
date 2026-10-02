// 弹层占用同一分类 URL 的一条历史记录，返回先关闭最上层弹层。
export function createModalHistory(host) {
    const entries = [];
    let sequence = 0;
    let pendingBack = false;
    const sync = () => {
        pendingBack = false;
        const token = host.history.state?.cinescopeModal;
        while (entries.length) {
            const entry = entries.at(-1);
            if (entry.token === token && entry.hash === host.location.hash) break;
            entries.pop();
            entry.onClose();
        }
    };
    host.addEventListener('popstate', sync);
    host.addEventListener('hashchange', sync);
    return {
        open(id, onClose) {
            if (entries.some((entry) => entry.id === id)) return;
            const token = `${id}-${++sequence}`;
            entries.push({ id, token, hash: host.location.hash, onClose });
            host.history.pushState({ ...host.history.state, cinescopeModal: token }, '', host.location.href);
        },
        close(id) {
            const entry = entries.at(-1);
            if (!entry || entry.id !== id) return false;
            if (host.history.state?.cinescopeModal !== entry.token || host.location.hash !== entry.hash) {
                sync();
                return true;
            }
            if (!pendingBack) {
                pendingBack = true;
                host.history.back();
            }
            return true;
        }
    };
}

let modalHistory;
export function getModalHistory() {
    return modalHistory ||= createModalHistory(window);
}
