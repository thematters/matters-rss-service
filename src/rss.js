const DEFAULT_API_URL = "https://server.matters.town/graphql";
const DEFAULT_SITE_ORIGIN = "https://matters.town";
const USERNAME_RE = /^[A-Za-z0-9_-]{1,64}$/;

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
            shortHash
            slug
            createdAt
            revisedAt
            noindex
            tags {
              content
            }
          }
        }
      }
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
  value = value.replace(/\.xml$/i, "");
  value = value.replace(/\/+$/, "");

  if (!USERNAME_RE.test(value)) {
    throw new HttpError(400, "Invalid Matters username.");
  }

  return value;
}

export function feedPathFor(userName) {
  return `/@${normalizeUserName(userName)}.xml`;
}

export function feedUrlFor(origin, userName) {
  return `${origin.replace(/\/+$/, "")}${feedPathFor(userName)}`;
}

export async function fetchAuthor(userName, options = {}) {
  const apiUrl = options.apiUrl || DEFAULT_API_URL;
  const fetchImpl = options.fetch || fetch;
  const response = await fetchImpl(apiUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      "user-agent": "matters-rss-service/0.1",
    },
    body: JSON.stringify({
      query: AUTHOR_RSS_QUERY,
      variables: { userName },
    }),
  });

  if (!response.ok) {
    throw new HttpError(502, `Matters API returned ${response.status}.`);
  }

  const payload = await response.json();
  if (payload.errors?.length) {
    throw new HttpError(502, payload.errors[0]?.message || "Matters API error.");
  }

  const user = payload.data?.user;
  if (!user) {
    throw new HttpError(404, "Matters author not found.");
  }

  const articles = (user.articles?.edges || [])
    .map((edge) => edge?.node)
    .filter(Boolean)
    .filter((article) => article.shortHash && !article.noindex)
    .map((article) => ({
      title: article.title || "Untitled",
      summary: article.summary || "",
      shortHash: article.shortHash,
      slug: article.slug || "",
      createdAt: article.createdAt,
      revisedAt: article.revisedAt,
      tags: (article.tags || [])
        .map((tag) => tag?.content)
        .filter((tag) => typeof tag === "string" && tag.trim())
        .map((tag) => tag.trim()),
    }));

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

export function buildRssXml({ user, articles }, options = {}) {
  const siteOrigin = options.siteOrigin || DEFAULT_SITE_ORIGIN;
  const feedOrigin = options.feedOrigin || options.origin || "";
  const feedUrl = feedOrigin ? feedUrlFor(feedOrigin, user.userName) : "";
  const webSubHubUrl = options.webSubHubUrl || "";
  const authorUrl = `${siteOrigin}/@${encodeURIComponent(user.userName)}`;
  const channelTitle = `${user.displayName} (@${user.userName}) - Matters`;
  const channelDescription =
    user.description || `Public Matters articles by ${user.displayName}.`;

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
        categories,
        "    </item>",
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n");

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    "  <channel>",
    `    <title>${escapeXml(channelTitle)}</title>`,
    `    <link>${escapeXml(authorUrl)}</link>`,
    `    <description>${escapeXml(channelDescription)}</description>`,
    "    <language>zh-Hant</language>",
    `    <lastBuildDate>${escapeXml(latestDate(articles).toUTCString())}</lastBuildDate>`,
    "    <ttl>15</ttl>",
    feedUrl
      ? `    <atom:link href="${escapeXml(feedUrl)}" rel="self" type="application/rss+xml" />`
      : "",
    webSubHubUrl ? `    <atom:link href="${escapeXml(webSubHubUrl)}" rel="hub" />` : "",
    user.avatar ? `    <image><url>${escapeXml(user.avatar)}</url><title>${escapeXml(channelTitle)}</title><link>${escapeXml(authorUrl)}</link></image>` : "",
    items,
    "  </channel>",
    "</rss>",
    "",
  ]
    .filter((line) => line !== "")
    .join("\n");
}

export function buildPreviewJson({ user, articles }, options = {}) {
  const siteOrigin = options.siteOrigin || DEFAULT_SITE_ORIGIN;
  const feedOrigin = options.feedOrigin || options.origin || "";
  return {
    user,
    feedUrl: feedOrigin ? feedUrlFor(feedOrigin, user.userName) : feedPathFor(user.userName),
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
  const data = await fetchAuthor(normalized, options);
  const xml = buildRssXml(data, {
    origin,
    feedOrigin: options.feedOrigin || origin,
    siteOrigin: options.siteOrigin || DEFAULT_SITE_ORIGIN,
    webSubHubUrl,
  });

  const linkHeader = [
    `<${feedUrlFor(options.feedOrigin || origin, normalized)}>; rel="self"; type="application/rss+xml"`,
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
  const pathname = decodeURIComponent(url.pathname);

  try {
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
      return await createPreviewResponse(url.searchParams.get("user"), request.url, options);
    }

    const rssMatch = pathname.match(/^\/(?:rss\/)?(@[A-Za-z0-9_-]{1,64}\.xml)$/);
    if (rssMatch) {
      return await createRssResponse(rssMatch[1], request.url, options);
    }

    if (typeof options.next === "function") {
      return options.next();
    }

    return new Response("Not found", { status: 404 });
  } catch (error) {
    return errorResponse(error);
  }
}
