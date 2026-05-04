const FIXED_RELEASE_WINDOWS = [
    { id: 'spring_festival', label: '春节档', start: '2025-01-28', end: '2025-02-12' },
    { id: 'spring_festival', label: '春节档', start: '2026-02-16', end: '2026-02-25' },
    { id: 'may_day', label: '五一档', start: '2025-05-01', end: '2025-05-05' },
    { id: 'may_day', label: '五一档', start: '2026-05-01', end: '2026-05-05' },
    { id: 'national_day', label: '国庆档', start: '2025-10-01', end: '2025-10-08' },
    { id: 'national_day', label: '国庆档', start: '2026-10-01', end: '2026-10-08' }
];

export function buildMovieReleaseWindows(releaseDate) {
    const dateText = String(releaseDate || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText)) {
        return [];
    }

    const windows = FIXED_RELEASE_WINDOWS
        .filter((window) => dateText >= window.start && dateText <= window.end)
        .map(({ id, label }) => ({ id, label }));

    const month = Number(dateText.slice(5, 7));
    if (month === 7 || month === 8) {
        windows.push({ id: 'summer', label: '暑期档' });
    }

    if (windows.length === 0 && isWeekendDate(dateText)) {
        windows.push({ id: 'weekend', label: '周末档' });
    }

    return dedupeReleaseWindows(windows);
}

function isWeekendDate(dateText) {
    const day = new Date(`${dateText}T00:00:00+08:00`).getDay();
    return day === 0 || day === 6;
}

function dedupeReleaseWindows(windows) {
    const seen = new Set();
    return windows.filter((window) => {
        if (seen.has(window.id)) return false;
        seen.add(window.id);
        return true;
    });
}
