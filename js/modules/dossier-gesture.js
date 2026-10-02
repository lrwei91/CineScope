export function resolveSwipeAxis(axis, deltaX, deltaY) {
    if (axis !== 'pending') return axis;
    if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) < 12) return axis;
    return deltaX > 0 && Math.abs(deltaX) > Math.abs(deltaY) * 1.25 ? 'horizontal' : 'vertical';
}
