import { KOREA_CONTENT_TYPE, KOREA_DRAFT_STATE } from "./korea-product-pipeline.js";

function globalState(article = {}) {
  return article.publishState || article.status || "written";
}

export function buildUnifiedPublishPlan({ articles = [], blogs = [], koreaDrafts = [] } = {}) {
  const globalArticle = articles.find((article) =>
    globalState(article) === "approved" &&
    !String(article.publishedUrl || "").trim()
  ) || null;

  const globalBlog = blogs.find((blog) =>
    blog.platform === "blogger" &&
    blog.status === "ready" &&
    String(blog.tokenRef || "").trim() &&
    String(blog.bloggerBlogId || "").trim()
  ) || null;

  const koreaDraft = koreaDrafts.find((draft) =>
    draft.state === KOREA_DRAFT_STATE.APPROVED &&
    draft.contentType === KOREA_CONTENT_TYPE.NEW_PRODUCT_REVIEW &&
    !String(draft.logNo || "").trim() &&
    !String(draft.publishedUrl || "").trim()
  ) || null;

  const blockers = [];
  if (!globalArticle) blockers.push("해외 승인·미발행 MASTER가 없습니다.");
  if (!globalBlog) blockers.push("연결된 Blogger 발행 채널이 없습니다.");
  if (!koreaDraft) blockers.push("국내 승인·미발행 신규 글이 없습니다.");

  return {
    ready: blockers.length === 0,
    blockers,
    global: globalArticle && globalBlog
      ? { articleId: globalArticle.id, title: globalArticle.title, blogId: globalBlog.id, blogName: globalBlog.name }
      : null,
    korea: koreaDraft
      ? { draftId: koreaDraft.id, title: koreaDraft.title, blogId: koreaDraft.blogId }
      : null,
  };
}
