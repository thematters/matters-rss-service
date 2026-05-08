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
const copyButton = document.querySelector("#copy-button");
const preview = document.querySelector("#preview");
const previewAuthor = document.querySelector("#preview-author");
const articleList = document.querySelector("#article-list");
const webSubPill = document.querySelector("#websub-pill");
const webSubState = document.querySelector("#websub-state");
const webSubTopic = document.querySelector("#websub-topic");
const webSubHub = document.querySelector("#websub-hub");

const USERNAME_RE = /^[A-Za-z0-9_-]{1,64}$/;

function setStatus(message, tone = "") {
  statusMessage.textContent = message;
  if (tone) {
    statusMessage.dataset.tone = tone;
  } else {
    delete statusMessage.dataset.tone;
  }
}

function normalizeUserName(rawValue) {
  let value = rawValue.trim();
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
  value = value.replace(/\.xml$/i, "");
  value = value.replace(/\/+$/, "");

  if (!USERNAME_RE.test(value)) {
    throw new Error("作者帳號只能包含英文字母、數字、底線或連字號。");
  }

  return value;
}

function feedUrlFor(userName) {
  return `${window.location.origin}/@${encodeURIComponent(userName)}.xml`;
}

function feedlyUrlFor(url) {
  return `https://feedly.com/i/subscription/feed/${encodeURIComponent(url)}`;
}

function inoreaderUrlFor(url) {
  return `https://www.inoreader.com/feed/${encodeURIComponent(url)}`;
}

function emailUrlFor(url) {
  const subject = "訂閱 Matters 作者更新";
  const body = [
    "我想用 Email 收到這位 Matters 作者的新文章：",
    "",
    url,
    "",
    "如果你使用 RSS by email，可以把這封信寄到 add@rssby.email。",
  ].join("\n");
  return `mailto:add@rssby.email?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
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
    title.rel = "noreferrer";
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
}

async function loadWebSubStatus(userName) {
  const response = await fetch(`/api/websub/status?user=${encodeURIComponent(userName)}`, {
    headers: { accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error("WebSub 狀態暫時無法確認。");
  }
  const status = await response.json();
  webSubTopic.textContent = status.topic || "-";
  webSubHub.textContent = status.hubUrl || "-";

  if (status.enabled && !status.usage?.pausedForToday) {
    webSubPill.textContent = "近即時通知可用";
    webSubState.textContent = "已啟用";
    delete webSubPill.dataset.tone;
    delete webSubState.dataset.tone;
  } else {
    webSubPill.textContent = "今日用量已滿時會自動降級";
    webSubState.textContent = "保留 RSS";
    webSubPill.dataset.tone = "paused";
    webSubState.dataset.tone = "paused";
  }
}

async function handleSubmit(event) {
  event.preventDefault();
  clearPreview();

  let userName;
  try {
    userName = normalizeUserName(input.value);
  } catch (error) {
    result.hidden = true;
    setStatus(error.message, "error");
    input.focus();
    return;
  }

  const url = feedUrlFor(userName);
  resultTitle.textContent = `把 @${userName} 加入你的資訊流`;
  feedUrl.href = url;
  feedUrl.textContent = url;
  openFeed.href = url;
  feedlyLink.href = feedlyUrlFor(url);
  inoreaderLink.href = inoreaderUrlFor(url);
  emailLink.href = emailUrlFor(url);
  webSubTopic.textContent = url;
  webSubHub.textContent = "偵測中";
  webSubPill.textContent = "自動更新偵測中";
  webSubState.textContent = "偵測中";
  result.hidden = false;

  setStatus("正在確認作者公開文章...");

  try {
    await loadPreview(userName);
    loadWebSubStatus(userName).catch(() => {
      webSubPill.textContent = "RSS 穩定可用";
      webSubState.textContent = "稍後重試";
      webSubHub.textContent = "暫時無法確認";
      webSubPill.dataset.tone = "paused";
      webSubState.dataset.tone = "paused";
    });
    setStatus("訂閱連結已建立。", "success");
  } catch (error) {
    setStatus(error.message, "error");
  }
}

async function copyFeedUrl() {
  const url = feedUrl.href;
  if (!url || url === "#") {
    return;
  }

  try {
    await navigator.clipboard.writeText(url);
    setStatus("訂閱連結已複製。", "success");
  } catch {
    setStatus("瀏覽器無法直接複製，請手動選取連結。", "error");
  }
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
hydrateFromQuery();
