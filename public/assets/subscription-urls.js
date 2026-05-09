const USERNAME_RE = /^[A-Za-z0-9_-]{1,64}$/;
const PUBLIC_FEED_ORIGIN = "https://rss.matters.town";
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

export function normalizeUserName(rawValue) {
  let value = String(rawValue || "").trim();
  if (!value) {
    throw new Error("請輸入 Matters 作者帳號。");
  }

  if (/^https?:\/\//i.test(value)) {
    let parsed;
    try {
      parsed = new URL(value);
    } catch {
      throw new Error("網址格式不正確。");
    }
    const segment = parsed.pathname
      .split("/")
      .filter(Boolean)
      .find((part) => part.startsWith("@"));
    if (!segment) {
      throw new Error("個人頁網址需要包含 @username。");
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
    throw new Error("作者帳號只能包含英文字母、數字、底線或連字號。");
  }

  return value;
}

export function feedOriginForLocation(location) {
  return LOCAL_HOSTS.has(location.hostname) ? PUBLIC_FEED_ORIGIN : location.origin;
}

export function encodedFeedUrlFor(origin, userName) {
  return `${origin.replace(/\/+$/, "")}/%40${encodeURIComponent(normalizeUserName(userName))}.xml`;
}

export function displayFeedUrlFor(origin, userName) {
  return `${origin.replace(/\/+$/, "")}/@${encodeURIComponent(normalizeUserName(userName))}.xml`;
}

export function feedlyUrlFor() {
  return "https://feedly.com/i/discover";
}

export function inoreaderUrlFor(feedUrl) {
  return `https://www.inoreader.com/feed/${encodeURIComponent(feedUrl)}`;
}

export function blogtrottrUrlFor() {
  return "https://blogtrottr.com/";
}

export function iftttTelegramUrlFor() {
  return "https://ifttt.com/applets/maxWVgiq-send-new-rss-feed-items-to-telegram";
}

export function w3cValidatorUrlFor(feedUrl) {
  return `https://validator.w3.org/feed/check.cgi?url=${encodeURIComponent(feedUrl)}`;
}

export function rssByEmailMailtoUrlFor(feedUrl) {
  const subject = "訂閱 Matters 作者更新";
  return `mailto:add@rssby.email?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(feedUrl)}`;
}
