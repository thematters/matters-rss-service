import assert from "node:assert/strict";

import {
  buildRssXml,
  feedPathFor,
  feedUrlFor,
  fetchAuthor,
  normalizeUserName as normalizeServerUserName,
} from "../src/rss.js";
import {
  blogtrottrUrlFor,
  displayFeedUrlFor,
  encodedFeedUrlFor,
  feedlyUrlFor,
  iftttTelegramUrlFor,
  inoreaderUrlFor,
  normalizeUserName as normalizeBrowserUserName,
  rssByEmailMailtoUrlFor,
  w3cValidatorUrlFor,
} from "../public/assets/subscription-urls.js";

const origin = "https://rss.matters.town";
const encodedFeedUrl = "https://rss.matters.town/%40mashbean.xml";

assert.equal(normalizeServerUserName("@mashbean.xml"), "mashbean");
assert.equal(normalizeServerUserName("%40mashbean.xml"), "mashbean");
assert.equal(feedPathFor("mashbean"), "/@mashbean.xml");
assert.equal(feedUrlFor(`${origin}/`, "mashbean"), "https://rss.matters.town/@mashbean.xml");

assert.equal(normalizeBrowserUserName("https://matters.town/@mashbean"), "mashbean");
assert.equal(normalizeBrowserUserName("%40mashbean.xml"), "mashbean");
assert.equal(encodedFeedUrlFor(origin, "mashbean"), encodedFeedUrl);
assert.equal(displayFeedUrlFor(origin, "mashbean"), "https://rss.matters.town/@mashbean.xml");

assert.equal(feedlyUrlFor(), "https://feedly.com/i/discover");
assert.equal(
  inoreaderUrlFor(encodedFeedUrl),
  "https://www.inoreader.com/feed/https%3A%2F%2Frss.matters.town%2F%2540mashbean.xml"
);
assert.equal(blogtrottrUrlFor(), "https://blogtrottr.com/");
assert.equal(
  iftttTelegramUrlFor(),
  "https://ifttt.com/applets/maxWVgiq-send-new-rss-feed-items-to-telegram"
);
assert.equal(
  w3cValidatorUrlFor(encodedFeedUrl),
  "https://validator.w3.org/feed/check.cgi?url=https%3A%2F%2Frss.matters.town%2F%2540mashbean.xml"
);

const mailto = new URL(rssByEmailMailtoUrlFor(encodedFeedUrl));
assert.equal(mailto.protocol, "mailto:");
assert.equal(mailto.pathname, "add@rssby.email");
assert.equal(mailto.searchParams.get("subject"), "訂閱 Matters 作者更新");
assert.equal(mailto.searchParams.get("body"), encodedFeedUrl);

const author = await fetchAuthor("mashbean", {
  fetch: async () =>
    new Response(
      JSON.stringify({
        data: {
          user: {
            id: "1",
            userName: "mashbean",
            displayName: "豆泥",
            avatar: "",
            info: { description: "Public profile" },
            articles: {
              edges: [
                {
                  node: {
                    id: "a1",
                    title: "Visible article",
                    summary: "Visible summary",
                    shortHash: "visiblehash",
                    slug: "",
                    createdAt: "2026-05-08T00:00:00.000Z",
                    revisedAt: "2026-05-08T00:00:00.000Z",
                    noindex: false,
                    tags: [{ content: "RSS" }],
                  },
                },
                {
                  node: {
                    id: "a2",
                    title: "Noindex article",
                    summary: "Hidden summary",
                    shortHash: "hiddenhash",
                    slug: "",
                    createdAt: "2026-05-08T00:00:00.000Z",
                    revisedAt: "2026-05-08T00:00:00.000Z",
                    noindex: true,
                    tags: [],
                  },
                },
                {
                  node: {
                    id: "a3",
                    title: "Missing hash article",
                    summary: "Hidden summary",
                    shortHash: "",
                    slug: "",
                    createdAt: "2026-05-08T00:00:00.000Z",
                    revisedAt: "2026-05-08T00:00:00.000Z",
                    noindex: false,
                    tags: [],
                  },
                },
              ],
            },
          },
        },
      }),
      {
        status: 200,
        headers: { "content-type": "application/json" },
      }
    ),
});

assert.equal(author.articles.length, 1);
assert.equal(author.articles[0].title, "Visible article");

const xml = buildRssXml(author, {
  feedOrigin: origin,
  siteOrigin: "https://matters.town",
});
assert.match(xml, /<rss version="2.0"/);
assert.match(xml, /Visible article/);
assert.doesNotMatch(xml, /Noindex article/);
assert.doesNotMatch(xml, /Missing hash article/);

console.log("Unit tests passed.");
