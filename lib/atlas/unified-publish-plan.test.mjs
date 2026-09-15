import test from "node:test";
import assert from "node:assert/strict";
import { buildUnifiedPublishPlan } from "./unified-publish-plan.js";

const approvedGlobal = { id: "art_new", title: "New guide", publishState: "approved", publishedUrl: "" };
const connectedBlog = { id: "blog_001", name: "ATLAS", platform: "blogger", status: "ready", tokenRef: "token_001", bloggerBlogId: "123" };
const approvedKorea = { id: "kr_new", title: "새 추천 글", state: "approved", contentType: "new_product_review", logNo: "", publishedUrl: "", blogId: "who-ami" };

test("selects one approved unpublished new post for each channel", () => {
  const plan = buildUnifiedPublishPlan({ articles: [approvedGlobal], blogs: [connectedBlog], koreaDrafts: [approvedKorea] });
  assert.equal(plan.ready, true);
  assert.equal(plan.global.articleId, "art_new");
  assert.equal(plan.korea.draftId, "kr_new");
});

test("never selects published global content or an existing Naver post update", () => {
  const plan = buildUnifiedPublishPlan({
    articles: [{ ...approvedGlobal, publishedUrl: "https://example.com/live" }],
    blogs: [connectedBlog],
    koreaDrafts: [{ ...approvedKorea, contentType: "existing_post_update", logNo: "224407589323" }],
  });
  assert.equal(plan.ready, false);
  assert.equal(plan.global, null);
  assert.equal(plan.korea, null);
});

test("requires the Blogger channel to be fully connected", () => {
  const plan = buildUnifiedPublishPlan({
    articles: [approvedGlobal],
    blogs: [{ ...connectedBlog, tokenRef: "" }],
    koreaDrafts: [approvedKorea],
  });
  assert.equal(plan.ready, false);
  assert.match(plan.blockers.join(" "), /Blogger/);
});
