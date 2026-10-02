// Free public feeds. Missing/old results are never presented as today's news.
import fs from 'fs';
import path from 'path';
import { readPublicSource, xmlValue } from '../unified-evidence.js';

const DIR = () => path.join(process.cwd(), '.atlas-data', 'research');
const GROUPS = [
  ['침구', '침구청소', '진드기', 'bedding', 'vacuum'],
  ['습도', '제습', '가습', 'humidity', 'dehumidifier'],
  ['주방', '수납', '선반', 'kitchen', 'storage'],
  ['여행', '수하물', '캐리어', 'travel', 'luggage', 'packing'],
  ['유심', '로밍', 'esim', 'roaming'],
];
export function relatedTo(a, b) {
  const left = String(a).toLowerCase(), right = String(b).toLowerCase();
  return GROUPS.some((words) => words.some((word) => left.includes(word)) && words.some((word) => right.includes(word)));
}
export function parseResearchFeed(xml, { now = Date.now(), recentOnly = false } = {}) {
  const urls = new Set();
  return [...String(xml).matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)].flatMap(([, entry]) => {
    const title = xmlValue(entry, 'title');
    const url = xmlValue(entry, 'link');
    const publishedAt = xmlValue(entry, 'pubDate');
    const date = Date.parse(publishedAt);
    if (!title || !/^https:\/\//i.test(url) || urls.has(url)) return [];
    if (recentOnly && (!Number.isFinite(date) || date > now || now - date > 7 * 24 * 60 * 60 * 1000)) return [];
    urls.add(url);
    return [{ title, url, publishedAt: Number.isFinite(date) ? new Date(date).toISOString() : '', source: xmlValue(entry, 'source') || new URL(url).hostname }];
  }).slice(0, 12);
}
export function readTopicResearch(channelId) {
  try {
    const report = JSON.parse(fs.readFileSync(path.join(DIR(), `${channelId}.json`), 'utf8'));
    const age = Date.now() - Date.parse(report.checkedAt);
    if (!Number.isFinite(age) || age < 0 || age >= 24 * 60 * 60 * 1000) return { ...report, stale: true, issues: [], products: [], references: [] };
    return report;
  } catch { return null; }
}
export async function refreshTopicResearch(channelId, topics = [], products = []) {
  const korea = channelId === 'korea_naver';
  const query = korea ? '가을 생활 가전 침구 주방 when:7d' : 'travel packing luggage changes when:7d';
  const newsUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=${korea ? 'ko&gl=KR&ceid=KR:ko' : 'en&gl=US&ceid=US:en'}`;
  const blogQuery = korea ? 'site:blog.naver.com 가을 침구 주방 생활 사용 후기' : 'travel packing luggage practical blog guide';
  const blogUrl = `https://www.bing.com/search?format=rss&q=${encodeURIComponent(blogQuery)}`;
  const readFeed = async (url, host) => {
    const xml = await readPublicSource(url, host);
    // A successful HTTP response may be a sign-in/error page rather than RSS.
    if (!/<rss\b[^>]*>[\s\S]*<channel\b[^>]*>[\s\S]*<\/channel>\s*<\/rss>/i.test(xml)) throw new Error('Invalid RSS response');
    return xml;
  };
  const results = await Promise.allSettled([readFeed(newsUrl, 'news.google.com'), readFeed(blogUrl, 'bing.com')]);
  const issues = results[0].status === 'fulfilled' ? parseResearchFeed(results[0].value, { recentOnly: true }) : [];
  const references = results[1].status === 'fulfilled' ? parseResearchFeed(results[1].value).filter((item) => !korea || new URL(item.url).hostname === 'blog.naver.com') : [];
  const report = { checkedAt: new Date().toISOString(), channelId, stale: false,
    providers: results.map((result, i) => ({ source: i ? '관련 참고 글 검색' : '최근 7일 뉴스', status: result.status === 'fulfilled' ? 'available' : 'unavailable' })),
    issues: issues.map((issue) => ({ ...issue, relatedTopicIds: topics.filter((topic) => relatedTo(issue.title, `${topic.title} ${topic.keyword}`)).map((topic) => topic.id),
      products: products.filter((product) => relatedTo(issue.title, product.name)).map((product) => ({ id: product.id, name: product.name, url: product.sellerUrl || product.sourceUrl, priceText: product.priceText, checkedAt: product.checkedAt })) })),
    references, products: products.filter((product) => issues.some((issue) => relatedTo(issue.title, product.name))).map((product) => ({ id: product.id, name: product.name, priceText: product.priceText, url: product.sellerUrl || product.sourceUrl })),
  };
  fs.mkdirSync(DIR(), { recursive: true });
  fs.writeFileSync(path.join(DIR(), `${channelId}.json`), JSON.stringify(report));
  return report;
}
