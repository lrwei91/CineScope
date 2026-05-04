import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { createDoubanSearchCache } from '../scripts/lib/douban-search-cache.mjs';

test('createDoubanSearchCache parses static subject_search DATA payload and reuses cache', async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), 'latest-tv-douban-search-'));
    let calls = 0;
    const cache = createDoubanSearchCache({ rootDir, ttlDays: 14 });
    const html = `
      <script>
        window.__DATA__ = {"items":[{"id":37426245,"title":"药屋少女的呢喃 第三季 薬屋のひとりごと 第3期‎ (2026)","url":"https://movie.douban.com/subject/37426245/","more_url":"onclick=\\"moreurl(this,{subject_id:'37426245'})\\""}]};
      </script>
    `;

    const fetchHtml = async () => {
        calls += 1;
        return html;
    };

    const first = await cache.fetchSearch({ query: '薬屋のひとりごと 第3期', fetchHtml });
    const second = await cache.fetchSearch({ query: '薬屋のひとりごと 第3期', fetchHtml });

    assert.equal(calls, 1);
    assert.equal(first[0].id, 37426245);
    assert.deepEqual(second, first);
    assert.equal(cache.summarize().hits, 1);

    await rm(rootDir, { recursive: true, force: true });
});
