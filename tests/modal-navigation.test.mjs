import test from 'node:test';
import assert from 'node:assert/strict';
import { createModalHistory } from '../js/modules/modal-history.js';
import { resolveSwipeAxis } from '../js/modules/dossier-gesture.js';

function createHost() {
    const listeners = new Map();
    const states = [null];
    let index = 0;
    let pending = false;
    const host = {
        location: { hash: '#movie_cn', href: 'http://localhost/#movie_cn' },
        addEventListener(type, listener) { listeners.set(type, listener); },
        history: {
            get state() { return states[index]; },
            pushState(state) { states.splice(++index, states.length, state); },
            back() { pending = true; host.backs++; }
        },
        backs: 0,
        flush() {
            if (!pending) return;
            pending = false;
            index--;
            listeners.get('popstate')();
        },
        navigate(hash) { host.location.hash = hash; listeners.get('hashchange')(); }
    };
    return host;
}

test('browser back closes detail without changing its category', () => {
    const host = createHost(), history = createModalHistory(host);
    let closed = 0;
    history.open('dossier', () => closed++);
    host.history.back();
    host.flush();
    assert.equal(closed, 1);
    assert.equal(host.location.hash, '#movie_cn');
});

test('explicit close consumes one entry and ignores repeated close requests', () => {
    const host = createHost(), history = createModalHistory(host);
    let closed = 0;
    history.open('dossier', () => closed++);
    history.open('dossier', () => closed++);
    history.close('dossier');
    history.close('dossier');
    assert.equal(host.backs, 1);
    host.flush();
    assert.equal(closed, 1);
    assert.equal(history.close('dossier'), false);
});

test('nested trailer back leaves detail open, then closes detail on next back', () => {
    const host = createHost(), history = createModalHistory(host), closed = [];
    history.open('dossier', () => closed.push('dossier'));
    history.open('trailer', () => closed.push('trailer'));
    history.close('trailer');
    host.flush();
    assert.deepEqual(closed, ['trailer']);
    history.close('dossier');
    host.flush();
    assert.deepEqual(closed, ['trailer', 'dossier']);
});

test('category navigation clears open overlays without another back', () => {
    const host = createHost(), history = createModalHistory(host);
    let closed = 0;
    history.open('dossier', () => closed++);
    host.navigate('#tv_cn');
    assert.equal(closed, 1);
    assert.equal(host.backs, 0);
});

test('vertical touch remains scrolling even if the finger drifts sideways', () => {
    assert.equal(resolveSwipeAxis('pending', 2, 8), 'pending');
    const axis = resolveSwipeAxis('pending', 4, -30);
    assert.equal(axis, 'vertical');
    assert.equal(resolveSwipeAxis(axis, 110, -50), 'vertical');
    assert.equal(resolveSwipeAxis('pending', 40, 4), 'horizontal');
    assert.equal(resolveSwipeAxis('pending', -40, 4), 'vertical');
});
