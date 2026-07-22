// Single source of truth for "how many affiliate products are actually active".
// Server-side the answer is derived only from articles.json affiliatePlan blocks
// with a real https url — never from client localStorage guesses. Today: 0.
import { isValidUrl } from "./revenue-layout-engine";

export function countActiveAffiliate(articles = []) {
  return articles.filter(
    (a) => a?.affiliatePlan?.status === "active" && isValidUrl(String(a.affiliatePlan.url || "")),
  ).length;
}
