// Canonical MASTER body — one rule for "where does an article's body live".
//
// ATLAS stores article bodies two different ways depending on how the article
// was authored:
//
//   • hand-written MASTER  → bodyMarkdown (bodyHtml is derived from it)
//   • CHATGPT_HANDOFF      → bodyHtml only. The atlas-package carries
//                            articleHtml, which chatgpt-package assembles with
//                            the uploaded images and stores as bodyHtml;
//                            bodyMarkdown stays "".
//
// The publish pipeline already follows exactly this precedence
// (lib/html-exporter.js: bodyMarkdown ? markdownToHtml(bodyMarkdown) : bodyHtml),
// so anything that reads or writes the body must follow it too. The Editor did
// not: it read bodyMarkdown alone, showed an empty box for every handoff
// article, and on save wrote that empty value back — which also blanked
// bodyHtml, because the articles PATCH re-derives bodyHtml from bodyMarkdown.

const str = (v) => (typeof v === "string" ? v : "");

// Which field holds this article's MASTER body. A brand-new article has
// neither, and hand authoring produces markdown, so that is the default.
export function masterBodyField(article) {
  if (str(article?.bodyMarkdown).trim()) return "bodyMarkdown";
  if (str(article?.bodyHtml).trim()) return "bodyHtml";
  return "bodyMarkdown";
}

// The body to show in the Editor. Never invents content — it only looks in the
// same order the publish pipeline does.
export function readMasterBody(article) {
  return str(article?.[masterBodyField(article)]);
}

// The patch to send when saving edited body text. Writing back into the field
// the body actually came from is what keeps a handoff article's bodyHtml from
// being overwritten by an empty bodyMarkdown.
export function masterBodyPatch(article, value) {
  return { [masterBodyField(article)]: str(value) };
}
