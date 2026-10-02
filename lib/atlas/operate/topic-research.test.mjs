import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readTopicResearch, refreshTopicResearch } from './topic-research.js';

test('expired, invalid and future cache timestamps never supply current candidates', () => {
  const previous = process.cwd();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-research-'));
  try {
    process.chdir(root);
    fs.mkdirSync('.atlas-data/research', { recursive: true });
    for (const checkedAt of ['invalid', null, new Date(Date.now() + 60000).toISOString(), new Date(Date.now() - 86400000).toISOString()]) {
      fs.writeFileSync('.atlas-data/research/korea_naver.json', JSON.stringify({ checkedAt, issues: ['old'], products: ['old'], references: ['old'] }));
      const report = readTopicResearch('korea_naver');
      assert.equal(report.stale, true);
      assert.deepEqual([report.issues, report.products, report.references], [[], [], []]);
    }
  } finally {
    process.chdir(previous);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('failed refresh replaces old candidates and distinguishes invalid responses from valid empty feeds', async () => {
  const previous = process.cwd();
  const originalFetch = globalThis.fetch;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-research-'));
  try {
    process.chdir(root);
    const now = new Date().toUTCString();
    globalThis.fetch = async () => new Response(`<rss><channel><item><title>침구 관리</title><link>https://blog.naver.com/example/1</link><pubDate>${now}</pubDate></item></channel></rss>`);
    const fresh = await refreshTopicResearch('korea_naver', [{ id: 'bedding', title: '침구' }], [{ id: 'vacuum', name: '침구청소기', sellerUrl: 'https://example.org/product' }]);
    assert.equal(fresh.issues.length, 1);
    assert.equal(fresh.products.length, 1);
    assert.equal(fresh.references.length, 1);
    globalThis.fetch = async (url) => {
      if (String(url).includes('bing.com')) throw new Error('offline');
      return new Response('<html>Service unavailable</html>');
    };
    const failed = await refreshTopicResearch('korea_naver');
    assert.ok(failed.providers.every((provider) => provider.status === 'unavailable'));
    assert.deepEqual([failed.issues, failed.products, failed.references], [[], [], []]);
    assert.deepEqual(readTopicResearch('korea_naver'), failed);
    globalThis.fetch = async () => new Response('<rss><channel></channel></rss>');
    const empty = await refreshTopicResearch('korea_naver');
    assert.ok(empty.providers.every((provider) => provider.status === 'available'));
    assert.deepEqual(empty.issues, []);
  } finally {
    globalThis.fetch = originalFetch;
    process.chdir(previous);
    fs.rmSync(root, { recursive: true, force: true });
  }
});
