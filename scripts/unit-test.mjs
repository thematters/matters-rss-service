import assert from "node:assert/strict";

import {
  buildRssXml,
  channelFeedPathFor,
  channelFeedUrlFor,
  feedPathFor,
  feedUrlFor,
  fetchAuthor,
  fetchChannel,
  normalizeChannelShortHash as normalizeServerChannelShortHash,
  normalizeUserName as normalizeServerUserName,
} from "../src/rss.js";
import {
  blogtrottrUrlFor,
  channelFeedUrlFor as browserChannelFeedUrlFor,
  displayFeedUrlFor,
  encodedFeedUrlFor,
  feedlyUrlFor,
  iftttTelegramUrlFor,
  inoreaderUrlFor,
  normalizeChannelShortHash as normalizeBrowserChannelShortHash,
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
assert.equal(normalizeServerChannelShortHash("/channel/nycmlq5d4w8a.xml"), "nycmlq5d4w8a");
assert.equal(normalizeServerChannelShortHash("https://matters.town/c/nycmlq5d4w8a"), "nycmlq5d4w8a");
assert.equal(channelFeedPathFor("nycmlq5d4w8a"), "/channel/nycmlq5d4w8a.xml");
assert.equal(
  channelFeedUrlFor(`${origin}/`, "nycmlq5d4w8a"),
  "https://rss.matters.town/channel/nycmlq5d4w8a.xml"
);

assert.equal(normalizeBrowserUserName("https://matters.town/@mashbean"), "mashbean");
assert.equal(normalizeBrowserUserName("%40mashbean.xml"), "mashbean");
assert.equal(normalizeBrowserChannelShortHash("https://matters.town/channel/nycmlq5d4w8a"), "nycmlq5d4w8a");
assert.equal(encodedFeedUrlFor(origin, "mashbean"), encodedFeedUrl);
assert.equal(displayFeedUrlFor(origin, "mashbean"), "https://rss.matters.town/@mashbean.xml");
assert.equal(
  browserChannelFeedUrlFor(origin, "nycmlq5d4w8a"),
  "https://rss.matters.town/channel/nycmlq5d4w8a.xml"
);

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
assert.equal(mailto.searchParams.get("subject"), "訂閱 Matters 更新");
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
                    content: "<p>Visible full content</p>",
                    shortHash: "visiblehash",
                    slug: "",
                    createdAt: "2026-05-08T00:00:00.000Z",
                    revisedAt: "2026-05-08T00:00:00.000Z",
                    noindex: false,
                    access: { type: "public" },
                    tags: [{ content: "RSS" }],
                  },
                },
                {
                  node: {
                    id: "a2",
                    title: "Noindex article",
                    summary: "Hidden summary",
                    content: "<p>Hidden noindex content</p>",
                    shortHash: "hiddenhash",
                    slug: "",
                    createdAt: "2026-05-08T00:00:00.000Z",
                    revisedAt: "2026-05-08T00:00:00.000Z",
                    noindex: true,
                    access: { type: "public" },
                    tags: [],
                  },
                },
                {
                  node: {
                    id: "a4",
                    title: "Paywalled article",
                    summary: "Paywalled summary",
                    content: "<p>Paywalled full content</p>",
                    shortHash: "paywallhash",
                    slug: "",
                    createdAt: "2026-05-08T00:00:00.000Z",
                    revisedAt: "2026-05-08T00:00:00.000Z",
                    noindex: false,
                    access: { type: "paywall" },
                    tags: [],
                  },
                },
                {
                  node: {
                    id: "a3",
                    title: "Missing hash article",
                    summary: "Hidden summary",
                    content: "<p>Hidden missing hash content</p>",
                    shortHash: "",
                    slug: "",
                    createdAt: "2026-05-08T00:00:00.000Z",
                    revisedAt: "2026-05-08T00:00:00.000Z",
                    noindex: false,
                    access: { type: "public" },
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
assert.match(xml, /xmlns:content="http:\/\/purl\.org\/rss\/1\.0\/modules\/content\/"/);
assert.match(xml, /<content:encoded><!\[CDATA\[<p>Visible full content<\/p>\]\]><\/content:encoded>/);
assert.doesNotMatch(xml, /Noindex article/);
assert.doesNotMatch(xml, /Paywalled article/);
assert.doesNotMatch(xml, /Paywalled full content/);
assert.doesNotMatch(xml, /Missing hash article/);

const channel = await fetchChannel("nycmlq5d4w8a", {
  fetch: async () =>
    new Response(
      JSON.stringify({
        data: {
          channel: {
            __typename: "TopicChannel",
            id: "c1",
            shortHash: "nycmlq5d4w8a",
            navbarTitle: "生活事",
            name: "生活事",
            channelArticles: {
              edges: [
                {
                  node: {
                    id: "ca1",
                    title: "Channel article",
                    summary: "Channel summary",
                    content: "<p>Channel full content</p>",
                    shortHash: "channelhash",
                    slug: "",
                    createdAt: "2026-05-08T00:00:00.000Z",
                    revisedAt: "2026-05-08T00:00:00.000Z",
                    noindex: false,
                    access: { type: "public" },
                    tags: [{ content: "生活" }],
                  },
                },
                {
                  node: {
                    id: "ca2",
                    title: "Circle article",
                    summary: "Circle summary",
                    content: "<p>Circle full content</p>",
                    shortHash: "circlehash",
                    slug: "",
                    createdAt: "2026-05-08T00:00:00.000Z",
                    revisedAt: "2026-05-08T00:00:00.000Z",
                    noindex: false,
                    access: { type: "circle" },
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

assert.equal(channel.channel.title, "生活事");
assert.equal(channel.articles.length, 1);
assert.equal(channel.articles[0].title, "Channel article");

const channelXml = buildRssXml(channel, {
  feedOrigin: origin,
  siteOrigin: "https://matters.town",
});
assert.match(channelXml, /生活事 - Matters/);
assert.match(channelXml, /https:\/\/matters\.town\/c\/nycmlq5d4w8a/);
assert.match(channelXml, /<content:encoded><!\[CDATA\[<p>Channel full content<\/p>\]\]><\/content:encoded>/);
assert.doesNotMatch(channelXml, /Circle article/);
assert.doesNotMatch(channelXml, /Circle full content/);

console.log("Unit tests passed.");
