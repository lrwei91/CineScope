// Tokens identify visits, even when several visits use the same category URL.
export function createModalHistory(host) {
    const entries = [];
    const visits = new Map();
    let sequence = 0;
    const session = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    let pendingBack = false;
    const sync = () => {
        pendingBack = false;
        const token = host.history.state?.cinescopeModal;
        const target = [];
        let visit = visits.get(token);
        while (visit && visit.hash === host.location.hash) {
            target.unshift(visit);
            visit = visits.get(visit.parent);
        }
        let shared = 0;
        while (shared < entries.length && shared < target.length && entries[shared] === target[shared]) shared++;
        while (entries.length > shared) entries.pop().onClose();
        for (const entry of target.slice(shared)) {
            entries.push(entry);
            entry.onRestore?.();
        }
    };
    host.addEventListener('popstate', sync);
    host.addEventListener('hashchange', sync);
    return {
        open(id, onClose, onRestore) {
            const existing = entries.find(entry => entry.id === id);
            if (existing) {
                existing.onClose = onClose;
                existing.onRestore = onRestore;
                return;
            }
            const token = `${id}-${session}-${++sequence}`;
            const entry = { id, token, parent: entries.at(-1)?.token, hash: host.location.hash, onClose, onRestore };
            visits.set(token, entry);
            entries.push(entry);
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
export function getModalHistory() { return modalHistory ||= createModalHistory(window); }
