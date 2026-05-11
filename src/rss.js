const DEFAULT_API_URL = "https://server.matters.town/graphql";
const DEFAULT_SITE_ORIGIN = "https://matters.town";
const USERNAME_RE = /^[A-Za-z0-9_-]{1,64}$/;
const CHANNEL_HASH_RE = /^[A-Za-z0-9_-]{1,64}$/;

export const RSS_CACHE_CONTROL =
  "public, max-age=0, s-maxage=900, stale-while-revalidate=86400";
export const CDN_CACHE_CONTROL =
  "public, max-age=900, stale-while-revalidate=86400";

const AUTHOR_RSS_QUERY = `#graphql
  query PublicAuthorRss($userName: String!) {
    user(input: { userName: $userName }) {
      id
      userName
      displayName
      avatar
      info {
        description
      }
      articles(input: { first: 50, sort: newest, filter: { state: active } }) {
        edges {
          node {
            id
            title
            summary
            content
            shortHash
            slug
            createdAt
            revisedAt
            noindex
            access {
              type
            }
            tags {
              content
            }
          }
        }
      }
    }
  }
`;

const CHANNELS_QUERY = `#graphql
  query PublicChannels {
    channels {
      __typename
      id
      shortHash
      navbarTitle
    }
  }
`;

const CHANNEL_RSS_QUERY = `#graphql
  query PublicChannelRss($shortHash: String!) {
    channel(input: { shortHash: $shortHash }) {
      __typename
      id
      shortHash
      navbarTitle
      ... on Tag {
        content
        tagArticles: articles(input: { first: 50 }) {
          edges {
            node {
              ...RssArticleFields
            }
          }
        }
      }
      ... on TopicChannel {
        name
        channelArticles: articles(input: { first: 50 }) {
          edges {
            node {
              ...RssArticleFields
            }
          }
        }
      }
      ... on CurationChannel {
        name
        channelArticles: articles(input: { first: 50 }) {
          edges {
            node {
              ...RssArticleFields
            }
          }
        }
      }
      ... on WritingChallenge {
        name
        description
        cover
        campaignArticles: articles(input: { first: 50 }) {
          edges {
            node {
              ...RssArticleFields
            }
          }
        }
      }
    }
  }

  fragment RssArticleFields on Article {
    id
    title
    summary
    content
    shortHash
    slug
    createdAt
    revisedAt
    noindex
    access {
      type
    }
    tags {
      content
    }
  }
`;

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
}

export function normalizeUserName(input) {
  if (typeof input !== "string") {
    throw new HttpError(400, "Missing Matters username.");
  }

  let value = input.trim();
  if (!value) {
    throw new HttpError(400, "Missing Matters username.");
  }

  if (/^https?:\/\//i.test(value)) {
    let url;
    try {
      url = new URL(value);
    } catch {
      throw new HttpError(400, "Invalid Matters profile URL.");
    }
    const segment = url.pathname
      .split("/")
      .filter(Boolean)
      .find((part) => part.startsWith("@"));
    if (!segment) {
      throw new HttpError(400, "Profile URL must include @username.");
    }
    value = segment;
  }

  value = value.replace(/^\/+/, "");
  value = value.replace(/^rss\//, "");
  value = value.replace(/^@/, "");
  value = value.replace(/^%40/i, "");
  value = value.replace(/\.xml$/i, "");
  value = value.replace(/\/+$/, "");

  if (!USERNAME_RE.test(value)) {
    throw new HttpError(400, "Invalid Matters username.");
  }

  return value;
}

export function normalizeChannelShortHash(input) {
  if (typeof input !== "string") {
    throw new HttpError(400, "Missing Matters channel.");
  }

  let value = input.trim();
  if (!value) {
    throw new HttpError(400, "Missing Matters channel.");
  }

  if (/^https?:\/\//i.test(value)) {
    let url;
    try {
      url = new URL(value);
    } catch {
      throw new HttpError(400, "Invalid Matters channel URL.");
    }
    const parts = url.pathname.split("/").filter(Boolean);
    const channelIndex = parts.findIndex((part) => ["c", "channel"].includes(part));
    value = channelIndex >= 0 ? parts[channelIndex + 1] || "" : parts.at(-1) || "";
  }

  value = value.replace(/^\/+/, "");
  value = value.replace(/^rss\//, "");
  value = value.replace(/^channel\//, "");
  value = value.replace(/^c\//, "");
  value = value.replace(/\.xml$/i, "");
  value = value.replace(/\/+$/, "");

  if (!CHANNEL_HASH_RE.test(value)) {
    throw new HttpError(400, "Invalid Matters channel.");
  }

  return value;
}

export function feedPathFor(userName) {
  return `/@${normalizeUserName(userName)}.xml`;
}

export function feedUrlFor(origin, userName) {
  return `${origin.replace(/\/+$/, "")}${feedPathFor(userName)}`;
}

export function channelFeedPathFor(shortHash) {
  return `/channel/${normalizeChannelShortHash(shortHash)}.xml`;
}

export function channelFeedUrlFor(origin, shortHash) {
  return `${origin.replace(/\/+$/, "")}${channelFeedPathFor(shortHash)}`;
}

function feedUrlFromRequest(requestUrl, userName) {
  const url = new URL(requestUrl);
  const decodedPathname = decodeURIComponent(url.pathname);
  const expectedPathname = feedPathFor(userName);
  if (decodedPathname === expectedPathname || decodedPathname === `/rss${expectedPathname}`) {
    return `${url.origin}${url.pathname}`;
  }
  return feedUrlFor(url.origin, userName);
}

function channelFeedUrlFromRequest(requestUrl, shortHash) {
  const url = new URL(requestUrl);
  const decodedPathname = decodeURIComponent(url.pathname);
  const expectedPathname = channelFeedPathFor(shortHash);
  if (decodedPathname === expectedPathname || decodedPathname === `/rss${expectedPathname}`) {
    return `${url.origin}${url.pathname}`;
  }
  return channelFeedUrlFor(url.origin, shortHash);
}

async function fetchGraphql(query, variables, options = {}) {
  const apiUrl = options.apiUrl || DEFAULT_API_URL;
  const fetchImpl = options.fetch || fetch;
  const response = await fetchImpl(apiUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      "user-agent": "matters-rss-service/0.1",
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    throw new HttpError(502, `Matters API returned ${response.status}.`);
  }

  const payload = await response.json();
  if (payload.errors?.length) {
    throw new HttpError(502, payload.errors[0]?.message || "Matters API error.");
  }

  return payload.data;
}

function articleFromNode(article) {
  return {
    title: article.title || "Untitled",
    summary: article.summary || "",
    contentHtml: article.content || "",
    shortHash: article.shortHash,
    slug: article.slug || "",
    createdAt: article.createdAt,
    revisedAt: article.revisedAt,
    tags: (article.tags || [])
      .map((tag) => tag?.content)
      .filter((tag) => typeof tag === "string" && tag.trim())
      .map((tag) => tag.trim()),
  };
}

function articlePublishedTime(article) {
  const time = new Date(article.createdAt).getTime();
  return Number.isFinite(time) ? time : 0;
}

function publicArticlesFromEdges(edges = []) {
  return edges
    .map((edge) => edge?.node)
    .filter(Boolean)
    .filter((article) => article.shortHash && !article.noindex && isPublicArticle(article))
    .map(articleFromNode)
    .sort((a, b) => articlePublishedTime(b) - articlePublishedTime(a));
}

export async function fetchAuthor(userName, options = {}) {
  const data = await fetchGraphql(AUTHOR_RSS_QUERY, { userName }, options);
  const user = data?.user;
  if (!user) {
    throw new HttpError(404, "Matters author not found.");
  }

  const articles = publicArticlesFromEdges(user.articles?.edges || []);

  return {
    user: {
      userName: user.userName,
      displayName: user.displayName || user.userName,
      avatar: user.avatar || "",
      description: user.info?.description || "",
    },
    articles,
  };
}

export async function fetchChannels(options = {}) {
  const data = await fetchGraphql(CHANNELS_QUERY, {}, options);
  const channels = (data?.channels || [])
    .filter((channel) => channel?.__typename === "TopicChannel")
    .filter((channel) => channel?.shortHash && channel?.navbarTitle)
    .map((channel) => ({
      type: channel.__typename,
      shortHash: channel.shortHash,
      title: channel.navbarTitle,
    }));

  return { channels };
}

function channelArticleEdges(channel) {
  return (
    channel?.channelArticles?.edges ||
    channel?.tagArticles?.edges ||
    channel?.campaignArticles?.edges ||
    []
  );
}

export async function fetchChannel(shortHash, options = {}) {
  const normalized = normalizeChannelShortHash(shortHash);
  const data = await fetchGraphql(CHANNEL_RSS_QUERY, { shortHash: normalized }, options);
  const channel = data?.channel;
  if (!channel) {
    throw new HttpError(404, "Matters channel not found.");
  }

  const title = channel.navbarTitle || channel.name || channel.content || "Matters 頻道";
  const description =
    channel.description || `Matters「${title}」頻道的公開文章。`;

  return {
    channel: {
      type: channel.__typename,
      shortHash: channel.shortHash,
      title,
      description,
      cover: channel.cover || "",
    },
    articles: publicArticlesFromEdges(channelArticleEdges(channel)),
  };
}

function stripInvalidXmlChars(value) {
  return String(value ?? "").replace(
    /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g,
    ""
  );
}

export function escapeXml(value) {
  return stripInvalidXmlChars(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function cdata(value) {
  return `<![CDATA[${stripInvalidXmlChars(value).replaceAll("]]>", "]]]]><![CDATA[>")}]]>`;
}

function isPublicArticle(article) {
  return article.access?.type === "public";
}

function toRfc822(dateLike) {
  const date = new Date(dateLike);
  if (Number.isNaN(date.getTime())) {
    return new Date().toUTCString();
  }
  return date.toUTCString();
}

function latestDate(articles) {
  const dates = articles
    .flatMap((article) => [article.revisedAt, article.createdAt])
    .filter(Boolean)
    .map((dateLike) => new Date(dateLike))
    .filter((date) => !Number.isNaN(date.getTime()))
    .sort((a, b) => b.getTime() - a.getTime());
  return dates[0] || new Date();
}

export function buildRssXml({ user, channel, articles }, options = {}) {
  const siteOrigin = options.siteOrigin || DEFAULT_SITE_ORIGIN;
  const feedOrigin = options.feedOrigin || options.origin || "";
  const isChannel = Boolean(channel);
  const feedUrl = options.feedUrl || (feedOrigin
    ? isChannel
      ? channelFeedUrlFor(feedOrigin, channel.shortHash)
      : feedUrlFor(feedOrigin, user.userName)
    : "");
  const webSubHubUrl = options.webSubHubUrl || "";
  const sourceUrl = isChannel
    ? `${siteOrigin}/c/${encodeURIComponent(channel.shortHash)}`
    : `${siteOrigin}/@${encodeURIComponent(user.userName)}`;
  const channelTitle = isChannel
    ? `${channel.title} - Matters`
    : `${user.displayName} (@${user.userName}) - Matters`;
  const channelDescription = isChannel
    ? channel.description
    : user.description || `Public Matters articles by ${user.displayName}.`;
  const imageUrl = isChannel ? channel.cover : user.avatar;

  const items = articles
    .map((article) => {
      const articleUrl = `${siteOrigin}/a/${encodeURIComponent(article.shortHash)}`;
      const categories = article.tags
        .map((tag) => `      <category>${escapeXml(tag)}</category>`)
        .join("\n");

      return [
        "    <item>",
        `      <title>${escapeXml(article.title)}</title>`,
        `      <link>${escapeXml(articleUrl)}</link>`,
        `      <guid isPermaLink="true">${escapeXml(articleUrl)}</guid>`,
        `      <pubDate>${escapeXml(toRfc822(article.createdAt))}</pubDate>`,
        `      <description>${escapeXml(article.summary)}</description>`,
        `      <content:encoded>${cdata(article.contentHtml || article.summary)}</content:encoded>`,
        categories,
        "    </item>",
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n");

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/">',
    "  <channel>",
    `    <title>${escapeXml(channelTitle)}</title>`,
    `    <link>${escapeXml(sourceUrl)}</link>`,
    `    <description>${escapeXml(channelDescription)}</description>`,
    "    <language>zh-Hant</language>",
    `    <lastBuildDate>${escapeXml(latestDate(articles).toUTCString())}</lastBuildDate>`,
    "    <ttl>15</ttl>",
    feedUrl
      ? `    <atom:link href="${escapeXml(feedUrl)}" rel="self" type="application/rss+xml" />`
      : "",
    webSubHubUrl ? `    <atom:link href="${escapeXml(webSubHubUrl)}" rel="hub" />` : "",
    imageUrl ? `    <image><url>${escapeXml(imageUrl)}</url><title>${escapeXml(channelTitle)}</title><link>${escapeXml(sourceUrl)}</link></image>` : "",
    items,
    "  </channel>",
    "</rss>",
    "",
  ]
    .filter((line) => line !== "")
    .join("\n");
}

export function buildPreviewJson({ user, channel, articles }, options = {}) {
  const siteOrigin = options.siteOrigin || DEFAULT_SITE_ORIGIN;
  const feedOrigin = options.feedOrigin || options.origin || "";
  return {
    user,
    channel,
    feedUrl: feedOrigin
      ? channel
        ? channelFeedUrlFor(feedOrigin, channel.shortHash)
        : feedUrlFor(feedOrigin, user.userName)
      : channel
        ? channelFeedPathFor(channel.shortHash)
        : feedPathFor(user.userName),
    articles: articles.slice(0, 3).map((article) => ({
      title: article.title,
      summary: article.summary,
      url: `${siteOrigin}/a/${article.shortHash}`,
      publishedAt: article.createdAt,
      tags: article.tags,
    })),
  };
}

export async function createRssResponse(userName, requestUrl, options = {}) {
  const normalized = normalizeUserName(userName);
  const origin = new URL(requestUrl).origin;
  const webSubHubUrl =
    typeof options.webSubHubUrl === "function"
      ? options.webSubHubUrl(origin)
      : options.webSubHubUrl;
  const feedUrl = options.feedUrl || feedUrlFromRequest(requestUrl, normalized);
  const data = await fetchAuthor(normalized, options);
  const xml = buildRssXml(data, {
    origin,
    feedOrigin: options.feedOrigin || origin,
    feedUrl,
    siteOrigin: options.siteOrigin || DEFAULT_SITE_ORIGIN,
    webSubHubUrl,
  });

  const linkHeader = [
    `<${feedUrl}>; rel="self"; type="application/rss+xml"`,
    webSubHubUrl ? `<${webSubHubUrl}>; rel="hub"` : "",
  ].filter(Boolean).join(", ");

  return new Response(xml, {
    status: 200,
    headers: {
      "content-type": "application/rss+xml; charset=utf-8",
      "cache-control": RSS_CACHE_CONTROL,
      "cdn-cache-control": CDN_CACHE_CONTROL,
      ...(linkHeader ? { link: linkHeader } : {}),
    },
  });
}

export async function createChannelRssResponse(shortHash, requestUrl, options = {}) {
  const normalized = normalizeChannelShortHash(shortHash);
  const origin = new URL(requestUrl).origin;
  const webSubHubUrl =
    typeof options.webSubHubUrl === "function"
      ? options.webSubHubUrl(origin)
      : options.webSubHubUrl;
  const feedUrl = options.feedUrl || channelFeedUrlFromRequest(requestUrl, normalized);
  const data = await fetchChannel(normalized, options);
  const xml = buildRssXml(data, {
    origin,
    feedOrigin: options.feedOrigin || origin,
    feedUrl,
    siteOrigin: options.siteOrigin || DEFAULT_SITE_ORIGIN,
    webSubHubUrl,
  });

  const linkHeader = [
    `<${feedUrl}>; rel="self"; type="application/rss+xml"`,
    webSubHubUrl ? `<${webSubHubUrl}>; rel="hub"` : "",
  ].filter(Boolean).join(", ");

  return new Response(xml, {
    status: 200,
    headers: {
      "content-type": "application/rss+xml; charset=utf-8",
      "cache-control": RSS_CACHE_CONTROL,
      "cdn-cache-control": CDN_CACHE_CONTROL,
      ...(linkHeader ? { link: linkHeader } : {}),
    },
  });
}

export async function createPreviewResponse(userName, requestUrl, options = {}) {
  const normalized = normalizeUserName(userName);
  const origin = new URL(requestUrl).origin;
  const data = await fetchAuthor(normalized, options);
  const body = JSON.stringify(
    buildPreviewJson(data, {
      origin,
      feedOrigin: options.feedOrigin || origin,
      siteOrigin: options.siteOrigin || DEFAULT_SITE_ORIGIN,
    })
  );

  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": RSS_CACHE_CONTROL,
      "cdn-cache-control": CDN_CACHE_CONTROL,
    },
  });
}

export async function createChannelPreviewResponse(shortHash, requestUrl, options = {}) {
  const normalized = normalizeChannelShortHash(shortHash);
  const origin = new URL(requestUrl).origin;
  const data = await fetchChannel(normalized, options);
  const body = JSON.stringify(
    buildPreviewJson(data, {
      origin,
      feedOrigin: options.feedOrigin || origin,
      siteOrigin: options.siteOrigin || DEFAULT_SITE_ORIGIN,
    })
  );

  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": RSS_CACHE_CONTROL,
      "cdn-cache-control": CDN_CACHE_CONTROL,
    },
  });
}

export async function createChannelsResponse(requestUrl, options = {}) {
  const body = JSON.stringify(await fetchChannels(options));
  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": RSS_CACHE_CONTROL,
      "cdn-cache-control": CDN_CACHE_CONTROL,
    },
  });
}

export function errorResponse(error) {
  const status = error instanceof HttpError ? error.status : 500;
  const message =
    error instanceof Error && status < 500
      ? error.message
      : "RSS service error.";

  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

export async function routeRequest(request, options = {}) {
  const url = new URL(request.url);

  try {
    const pathname = decodeURIComponent(url.pathname);

    if (pathname === "/healthz") {
      if (request.method !== "GET" && request.method !== "HEAD") {
        return new Response("Method not allowed", {
          status: 405,
          headers: { allow: "GET, HEAD" },
        });
      }
      return new Response(JSON.stringify({ ok: true }), {
        headers: { "content-type": "application/json; charset=utf-8" },
      });
    }

    if (pathname === "/websub/hub") {
      const { handleWebSubHub } = await import("./websub.js");
      return await handleWebSubHub(request, options);
    }

    if (pathname === "/api/websub/status") {
      if (request.method !== "GET" && request.method !== "HEAD") {
        return new Response("Method not allowed", {
          status: 405,
          headers: { allow: "GET, HEAD" },
        });
      }
      const { handleWebSubStatus } = await import("./websub.js");
      return await handleWebSubStatus(request, options);
    }

    if (pathname === "/api/websub/check") {
      if (request.method !== "POST") {
        return new Response("Method not allowed", {
          status: 405,
          headers: { allow: "POST" },
        });
      }
      const { handleWebSubCheck } = await import("./websub.js");
      return await handleWebSubCheck(request, options);
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method not allowed", {
        status: 405,
        headers: { allow: "GET, HEAD" },
      });
    }

    if (pathname === "/api/preview") {
      const channel = url.searchParams.get("channel");
      if (channel) {
        return await createChannelPreviewResponse(channel, request.url, options);
      }
      return await createPreviewResponse(url.searchParams.get("user"), request.url, options);
    }

    if (pathname === "/api/channels") {
      return await createChannelsResponse(request.url, options);
    }

    const rssMatch = pathname.match(/^\/(?:rss\/)?(@[A-Za-z0-9_-]{1,64}\.xml)$/);
    if (rssMatch) {
      return await createRssResponse(rssMatch[1], request.url, options);
    }

    const channelRssMatch = pathname.match(/^\/(?:rss\/)?channel\/([A-Za-z0-9_-]{1,64}\.xml)$/);
    if (channelRssMatch) {
      return await createChannelRssResponse(channelRssMatch[1], request.url, options);
    }

    if (typeof options.next === "function") {
      return options.next();
    }

    return new Response("Not found", { status: 404 });
  } catch (error) {
    return errorResponse(error);
  }
}
