import {
  blogtrottrUrlFor,
  displayFeedUrlFor,
  encodedFeedUrlFor,
  feedlyUrlFor,
  feedOriginForLocation,
  iftttTelegramUrlFor,
  inoreaderUrlFor,
  normalizeUserName,
  rssByEmailMailtoUrlFor,
  w3cValidatorUrlFor,
} from "./subscription-urls.js";

const form = document.querySelector("#feed-form");
const input = document.querySelector("#author-input");
const statusMessage = document.querySelector("#status-message");
const result = document.querySelector("#result");
const resultTitle = document.querySelector("#result-title");
const feedUrl = document.querySelector("#feed-url");
const openFeed = document.querySelector("#open-feed");
const feedlyLink = document.querySelector("#feedly-link");
const inoreaderLink = document.querySelector("#inoreader-link");
const emailLink = document.querySelector("#email-link");
const blogtrottrLink = document.querySelector("#blogtrottr-link");
const iftttTelegramLink = document.querySelector("#ifttt-telegram-link");
const validatorLink = document.querySelector("#validator-link");
const copyButton = document.querySelector("#copy-button");
const copyButtonLabel = document.querySelector("#copy-button-label");
const preview = document.querySelector("#preview");
const previewAuthor = document.querySelector("#preview-author");
const articleList = document.querySelector("#article-list");
const webSubTopic = document.querySelector("#websub-topic");
const webSubHub = document.querySelector("#websub-hub");

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);
let copyButtonResetTimer = 0;

function setStatus(message, tone = "") {
  statusMessage.textContent = message;
  if (tone) {
    statusMessage.dataset.tone = tone;
  } else {
    delete statusMessage.dataset.tone;
  }
}

function friendlyErrorMessage(error) {
  const message = error instanceof Error ? error.message : String(error || "");
  if (message === "Matters author not found.") {
    return "找不到這位 Matters 作者，請確認帳號是否正確。";
  }
  if (message.startsWith("Matters API returned") || message === "Matters API error.") {
    return "暫時無法連上 Matters，請稍後再試。";
  }
  return message || "發生未知錯誤，請稍後再試。";
}

function selectFeedUrlText() {
  const selection = window.getSelection();
  if (!selection) {
    return;
  }
  const range = document.createRange();
  range.selectNodeContents(feedUrl);
  selection.removeAllRanges();
  selection.addRange(range);
}

function feedOrigin() {
  return feedOriginForLocation(window.location);
}

function publicServiceUrl(url) {
  if (!LOCAL_HOSTS.has(window.location.hostname)) {
    return url;
  }
  try {
    const parsed = new URL(url);
    if (parsed.origin === window.location.origin) {
      return `${feedOrigin()}${parsed.pathname}${parsed.search}`;
    }
  } catch {
    return url;
  }
  return url;
}

function formatDate(dateLike) {
  const date = new Date(dateLike);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return new Intl.DateTimeFormat("zh-Hant-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function clearPreview() {
  preview.hidden = true;
  previewAuthor.textContent = "";
  articleList.replaceChildren();
}

function renderPreview(payload) {
  preview.hidden = false;
  previewAuthor.textContent = `@${payload.user.userName}`;
  articleList.replaceChildren();

  if (!payload.articles.length) {
    const empty = document.createElement("li");
    empty.className = "empty";
    empty.textContent = "目前沒有可顯示的公開文章。";
    articleList.append(empty);
    return;
  }

  for (const article of payload.articles) {
    const item = document.createElement("li");
    item.className = "article";

    const title = document.createElement("a");
    title.className = "article__title";
    title.href = article.url;
    title.target = "_blank";
    title.rel = "noopener noreferrer";
    title.textContent = article.title || "Untitled";

    const meta = document.createElement("div");
    meta.className = "article__meta";
    const date = formatDate(article.publishedAt);
    if (date) {
      const dateNode = document.createElement("span");
      dateNode.textContent = date;
      meta.append(dateNode);
    }
    for (const tag of (article.tags || []).slice(0, 3)) {
      const tagNode = document.createElement("span");
      tagNode.textContent = `#${tag}`;
      meta.append(tagNode);
    }

    item.append(title);
    if (meta.childNodes.length) {
      item.append(meta);
    }

    if (article.summary) {
      const summary = document.createElement("p");
      summary.className = "article__summary";
      summary.textContent = article.summary;
      item.append(summary);
    }

    articleList.append(item);
  }
}

async function loadPreview(userName) {
  const response = await fetch(`/api/preview?user=${encodeURIComponent(userName)}`, {
    headers: { accept: "application/json" },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || "讀取作者公開文章失敗。");
  }
  renderPreview(payload);
  return payload;
}

async function loadWebSubStatus(userName) {
  const response = await fetch(`/api/websub/status?user=${encodeURIComponent(userName)}`, {
    headers: { accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error("WebSub 狀態暫時無法確認。");
  }
  const status = await response.json();
  webSubTopic.textContent = status.topic ? publicServiceUrl(status.topic) : "-";
  webSubHub.textContent = status.hubUrl ? publicServiceUrl(status.hubUrl) : "-";
}

async function handleSubmit(event) {
  event.preventDefault();
  clearPreview();
  result.hidden = true;

  let userName;
  try {
    userName = normalizeUserName(input.value);
  } catch (error) {
    result.hidden = true;
    setStatus(error.message, "error");
    input.focus();
    return;
  }

  setStatus("正在確認作者公開文章...");

  try {
    const payload = await loadPreview(userName);
    const canonicalUserName = payload.user.userName || userName;
    const origin = feedOrigin();
    const url = encodedFeedUrlFor(origin, canonicalUserName);
    const displayUrl = displayFeedUrlFor(origin, canonicalUserName);

    resultTitle.textContent = `把 @${canonicalUserName} 加入你的資訊流`;
    feedUrl.href = url;
    feedUrl.textContent = displayUrl;
    openFeed.href = url;
    feedlyLink.href = feedlyUrlFor();
    feedlyLink.setAttribute("aria-label", "複製 RSS 連結並開啟 Feedly");
    inoreaderLink.href = inoreaderUrlFor(url);
    emailLink.href = rssByEmailMailtoUrlFor(url);
    blogtrottrLink.href = blogtrottrUrlFor();
    iftttTelegramLink.href = iftttTelegramUrlFor();
    validatorLink.href = w3cValidatorUrlFor(url);
    webSubTopic.textContent = displayUrl;
    webSubHub.textContent = "確認中";
    result.hidden = false;

    loadWebSubStatus(userName).catch(() => {
      webSubHub.textContent = "暫時無法確認";
    });
    setStatus("訂閱連結已建立。", "success");
  } catch (error) {
    result.hidden = true;
    clearPreview();
    setStatus(friendlyErrorMessage(error), "error");
  }
}

async function copyText(text, successMessage = "訂閱連結已複製。") {
  if (!text || text === "#") {
    return false;
  }

  try {
    if (!navigator.clipboard?.writeText) {
      throw new Error("Clipboard API unavailable.");
    }
    await navigator.clipboard.writeText(text);
    setStatus(successMessage, "success");
    showCopiedState();
    return true;
  } catch {
    const fallbackInput = document.createElement("textarea");
    fallbackInput.value = text;
    fallbackInput.setAttribute("readonly", "");
    fallbackInput.style.position = "fixed";
    fallbackInput.style.inset = "0 auto auto 0";
    fallbackInput.style.opacity = "0";
    document.body.append(fallbackInput);
    fallbackInput.select();
    const copied = document.execCommand("copy");
    fallbackInput.remove();
    if (copied) {
      setStatus(successMessage, "success");
      showCopiedState();
      return true;
    }

    if (text === feedUrl.href) {
      selectFeedUrlText();
    }
    setStatus("已幫你選取訂閱連結，請按 Cmd 或 Ctrl + C 複製。");
    return false;
  }
}

function showCopiedState() {
  if (!copyButton || !copyButtonLabel) {
    return;
  }
  window.clearTimeout(copyButtonResetTimer);
  copyButton.dataset.copied = "true";
  copyButtonLabel.textContent = "已複製";
  copyButtonResetTimer = window.setTimeout(() => {
    delete copyButton.dataset.copied;
    copyButtonLabel.textContent = "複製 RSS 連結";
  }, 2400);
}

function copyFeedUrl() {
  copyText(feedUrl.href);
}

function openFeedly() {
  const url = feedUrl.href;
  copyText(url, "RSS 連結已複製。Feedly 開啟後，請貼到搜尋欄。");
}

function hydrateFromQuery() {
  const params = new URLSearchParams(window.location.search);
  const user = params.get("user");
  if (user) {
    input.value = user;
    form.requestSubmit();
  }
}

form.addEventListener("submit", handleSubmit);
copyButton.addEventListener("click", copyFeedUrl);
feedlyLink.addEventListener("click", openFeedly);
hydrateFromQuery();
