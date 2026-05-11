import {
  buildRssXml,
  CDN_CACHE_CONTROL,
  channelFeedUrlFor,
  fetchChannel,
  fetchAuthor,
  feedUrlFor,
  HttpError,
  normalizeChannelShortHash,
  normalizeUserName,
  RSS_CACHE_CONTROL,
} from "./rss.js";
import { todayKey } from "./storage.js";

const DEFAULT_LEASE_SECONDS = 60 * 60 * 24 * 7;
const MAX_LEASE_SECONDS = 60 * 60 * 24 * 30;
const DEFAULT_DAILY_DELIVERY_LIMIT = 2500;
const CALLBACK_TIMEOUT_MS = 8000;

function jsonResponse(body, init = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...(init.headers || {}),
    },
  });
}

function getEnv(options = {}) {
  return options.env || {};
}

export function hubUrlFor(origin, env = {}) {
  return (env.WEBSUB_HUB_URL || `${origin.replace(/\/+$/, "")}/websub/hub`).trim();
}

export function dailyDeliveryLimit(env = {}) {
  const parsed = Number(env.WEBSUB_DAILY_DELIVERY_LIMIT);
  if (Number.isFinite(parsed) && parsed >= 0) {
    return parsed;
  }
  return DEFAULT_DAILY_DELIVERY_LIMIT;
}

export function canonicalTopicUrl(requestUrl, topic, env = {}) {
  const origin = new URL(requestUrl).origin;
  const parsed = new URL(topic, origin);
  const expectedOrigin = new URL(env.WEBSUB_TOPIC_ORIGIN || origin).origin;
  if (parsed.origin !== expectedOrigin && parsed.origin !== origin) {
    throw new HttpError(400, "Unsupported WebSub topic.");
  }

  const parsedTopic = topicFromPathname(parsed.pathname);
  if (parsedTopic.type === "author") {
    return feedUrlFor(expectedOrigin, normalizeUserName(parsedTopic.value));
  }

  return channelFeedUrlFor(expectedOrigin, normalizeChannelShortHash(parsedTopic.value));
}

export function topicFromPathname(pathname) {
  const decoded = decodeURIComponent(pathname);
  const authorMatch = decoded.match(/^\/(?:rss\/)?@([A-Za-z0-9_-]{1,64})\.xml$/);
  if (authorMatch) {
    return { type: "author", value: normalizeUserName(authorMatch[1]) };
  }

  const channelMatch = decoded.match(/^\/(?:rss\/)?channel\/([A-Za-z0-9_-]{1,64})\.xml$/);
  if (channelMatch) {
    return { type: "channel", value: normalizeChannelShortHash(channelMatch[1]) };
  }

  throw new HttpError(400, "WebSub topic must be an author or channel RSS URL.");
}

export function feedTopicFromTopicUrl(topic) {
  const url = new URL(topic);
  try {
    return topicFromPathname(url.pathname);
  } catch {
    throw new HttpError(400, "Invalid WebSub topic.");
  }
}

async function fetchDataForTopic(topic, options = {}) {
  const parsedTopic = feedTopicFromTopicUrl(topic);
  if (parsedTopic.type === "channel") {
    return await fetchChannel(parsedTopic.value, options);
  }
  return await fetchAuthor(parsedTopic.value, options);
}

function assertCallbackUrl(callback) {
  let url;
  try {
    url = new URL(callback);
  } catch {
    throw new HttpError(400, "Invalid WebSub callback URL.");
  }
  if (url.protocol !== "https:" && url.hostname !== "localhost") {
    throw new HttpError(400, "WebSub callback must use HTTPS.");
  }
  return url.toString();
}

function clampLeaseSeconds(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_LEASE_SECONDS;
  }
  return Math.min(Math.floor(parsed), MAX_LEASE_SECONDS);
}

function randomChallenge() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function verifyCallback({ callback, mode, topic, leaseSeconds, fetchImpl = fetch }) {
  const challenge = randomChallenge();
  const callbackUrl = new URL(callback);
  callbackUrl.searchParams.set("hub.mode", mode);
  callbackUrl.searchParams.set("hub.topic", topic);
  callbackUrl.searchParams.set("hub.challenge", challenge);
  if (mode === "subscribe") {
    callbackUrl.searchParams.set("hub.lease_seconds", String(leaseSeconds));
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CALLBACK_TIMEOUT_MS);
  try {
    const response = await fetchImpl(callbackUrl.toString(), {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
    });
    const text = await response.text();
    if (!response.ok || text.trim() !== challenge) {
      throw new HttpError(400, "WebSub callback verification failed.");
    }
  } finally {
    clearTimeout(timeout);
  }
}

export async function handleWebSubHub(request, options = {}) {
  const env = getEnv(options);
  const storage = options.storage;
  if (!storage) {
    throw new HttpError(503, "WebSub storage is not configured.");
  }

  if (request.method === "GET") {
    return jsonResponse({
      ok: true,
      hub: hubUrlFor(new URL(request.url).origin, env),
      supportedTopics: ["/@{userName}.xml", "/channel/{shortHash}.xml"],
    });
  }

  if (request.method !== "POST") {
    return new Response("Method not allowed", {
      status: 405,
      headers: { allow: "GET, POST" },
    });
  }

  if (env.WEBSUB_DISABLED === "1") {
    throw new HttpError(503, "WebSub is currently paused.");
  }

  const form = await request.formData();
  const mode = form.get("hub.mode");
  const topic = canonicalTopicUrl(request.url, String(form.get("hub.topic") || ""), env);
  const callback = assertCallbackUrl(String(form.get("hub.callback") || ""));
  const leaseSeconds = clampLeaseSeconds(form.get("hub.lease_seconds"));
  const verify = String(form.get("hub.verify") || "sync");
  const secret = String(form.get("hub.secret") || "");

  if (mode !== "subscribe" && mode !== "unsubscribe") {
    throw new HttpError(400, "Unsupported WebSub mode.");
  }
  if (!["sync", "async"].includes(verify)) {
    throw new HttpError(400, "Unsupported WebSub verification mode.");
  }
  if (secret.length > 200) {
    throw new HttpError(400, "WebSub secret is too long.");
  }

  await verifyCallback({
    callback,
    mode,
    topic,
    leaseSeconds,
    fetchImpl: options.fetch || fetch,
  });

  if (mode === "unsubscribe") {
    await storage.deleteSubscription(topic, callback);
    return new Response("", { status: 204 });
  }

  const expiresAt = new Date(Date.now() + leaseSeconds * 1000).toISOString();
  await storage.upsertSubscription({
    topic,
    callback,
    secret,
    leaseSeconds,
    expiresAt,
  });

  return new Response("", { status: 202 });
}

async function hmacSha1(secret, body) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function deliverToSubscriber({ subscription, body, guid, fetchImpl, storage }) {
  const headers = {
    "content-type": "application/rss+xml; charset=utf-8",
    "user-agent": "matters-rss-websub/0.1",
    "link": `<${subscription.topic}>; rel="self"`,
  };
  if (subscription.secret) {
    headers["x-hub-signature"] = `sha1=${await hmacSha1(subscription.secret, body)}`;
  }

  try {
    const response = await fetchImpl(subscription.callback, {
      method: "POST",
      headers,
      body,
    });
    const ok = response.status >= 200 && response.status < 300;
    if (storage.recordDelivery) {
      await storage.recordDelivery({
        topic: subscription.topic,
        callback: subscription.callback,
        guid,
        status: ok ? "delivered" : "failed",
        statusCode: response.status,
      });
    }
    return { ok, status: response.status };
  } catch (error) {
    if (storage.recordDelivery) {
      await storage.recordDelivery({
        topic: subscription.topic,
        callback: subscription.callback,
        guid,
        status: "failed",
        error: error instanceof Error ? error.message : "Delivery failed",
      });
    }
    return { ok: false, error: error instanceof Error ? error.message : "Delivery failed" };
  }
}

export async function runWebSubPoll(options = {}) {
  const env = getEnv(options);
  const storage = options.storage;
  if (!storage) {
    throw new HttpError(503, "WebSub storage is not configured.");
  }
  if (env.WEBSUB_DISABLED === "1") {
    return { ok: true, paused: true, checked: 0, delivered: 0 };
  }

  const fetchImpl = options.fetch || fetch;
  const topics = await storage.listActiveTopics();
  const date = todayKey();
  const limit = dailyDeliveryLimit(env);
  let delivered = 0;
  let checked = 0;
  let paused = false;

  for (const { topic } of topics) {
    await storage.incrementUsage(date, "checks", 1);
    checked += 1;

    const data = await fetchDataForTopic(topic, { ...options, fetch: fetchImpl });
    const latest = data.articles[0];
    if (!latest) {
      continue;
    }

    const topicState = await storage.getTopicState(topic);
    if (!topicState?.latestGuid) {
      await storage.upsertTopicState(topic, latest.shortHash);
      continue;
    }
    if (topicState.latestGuid === latest.shortHash) {
      continue;
    }

    const usage = await storage.getUsage(date);
    if (usage.deliveries >= limit) {
      paused = true;
      break;
    }

    const remaining = Math.max(0, limit - usage.deliveries);
    const subscribers = (await storage.listActiveSubscriptionsByTopic(topic)).slice(0, remaining);
    if (!subscribers.length) {
      await storage.upsertTopicState(topic, latest.shortHash);
      continue;
    }

    const xml = buildRssXml(data, {
      feedOrigin: new URL(topic).origin,
      origin: new URL(topic).origin,
      webSubHubUrl: hubUrlFor(new URL(topic).origin, env),
    });

    for (const subscription of subscribers) {
      await storage.incrementUsage(date, "deliveries", 1);
      await deliverToSubscriber({
        subscription,
        body: xml,
        guid: latest.shortHash,
        fetchImpl,
        storage,
      });
      delivered += 1;
    }

    await storage.upsertTopicState(topic, latest.shortHash);
  }

  return { ok: true, checked, delivered, paused, limit };
}

export async function handleWebSubStatus(request, options = {}) {
  const env = getEnv(options);
  const storage = options.storage;
  const url = new URL(request.url);
  const user = url.searchParams.get("user");
  const channel = url.searchParams.get("channel");
  const origin = url.origin;
  const usage = storage ? await storage.getUsage(todayKey()) : { checks: 0, deliveries: 0 };
  const limit = dailyDeliveryLimit(env);
  let topic = null;
  let subscriberCount = 0;

  if (user && storage) {
    topic = feedUrlFor(env.WEBSUB_TOPIC_ORIGIN || origin, normalizeUserName(user));
    subscriberCount = (await storage.listActiveSubscriptionsByTopic(topic)).length;
  } else if (channel && storage) {
    topic = channelFeedUrlFor(env.WEBSUB_TOPIC_ORIGIN || origin, normalizeChannelShortHash(channel));
    subscriberCount = (await storage.listActiveSubscriptionsByTopic(topic)).length;
  }

  return jsonResponse({
    enabled: env.WEBSUB_DISABLED !== "1",
    hubUrl: hubUrlFor(origin, env),
    topic,
    subscriberCount,
    usage: {
      date: todayKey(),
      checks: usage.checks || 0,
      deliveries: usage.deliveries || 0,
      dailyDeliveryLimit: limit,
      pausedForToday: (usage.deliveries || 0) >= limit,
    },
  });
}

export async function handleWebSubCheck(request, options = {}) {
  const env = getEnv(options);
  const token = env.WEBSUB_ADMIN_TOKEN;
  if (token) {
    const auth = request.headers.get("authorization") || "";
    if (auth !== `Bearer ${token}`) {
      throw new HttpError(401, "Unauthorized.");
    }
  }
  return jsonResponse(await runWebSubPoll(options));
}
