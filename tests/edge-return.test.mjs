import test from 'node:test';
import assert from 'node:assert/strict';
import { createReturnGesture } from '../js/modules/edge-return.js';
const gesture = () => createReturnGesture({x: 32, y: 300}, 390);
test('vertical scrolling never changes into a return after sideways drift', () => {
    const g = gesture();
    assert.equal(g.move({x: 34,y: 270}).phase, 'cancelled');
    assert.equal(g.move({x: 200,y: 260}).phase, 'cancelled');
    assert.equal(g.finish(), false);
});
test('position is always measured from the immutable start; completion fires once', () => {
    const g = gesture();
    assert.equal(g.move({x: 60,y: 300}).distance, 28);
    assert.equal(g.move({x: 140,y: 302}).distance, 108);
    assert.equal(g.finish(), true);
    assert.equal(g.finish(), false);
});
test('short, reversed and interrupted gestures cannot return', () => {
    const short = gesture(); short.move({x: 90,y: 300}); assert.equal(short.finish(), false);
    const reverse = gesture(); reverse.move({x: 150,y: 300}); reverse.move({x: 100,y: 300}); assert.equal(reverse.finish(), false);
    const cancelled = gesture(); cancelled.move({x: 200,y: 300}); cancelled.cancel(); assert.equal(cancelled.finish(), false);
});
