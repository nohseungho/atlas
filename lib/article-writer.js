import { markdownToHtml } from "./html-exporter";
import { generateRevenueArticle } from "./atlas/revenue-writer-engine";

export function generateArticleFromKeyword(keyword) {
  const article = generateRevenueArticle(keyword);
  return { ...article, bodyHtml: markdownToHtml(article.bodyMarkdown) };
}
