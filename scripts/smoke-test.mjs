import assert from "node:assert/strict";

import { routeRequest } from "../src/rss.js";
import { MemoryWebSubStorage } from "../src/storage.js";
import { hubUrlFor } from "../src/websub.js";

const origin = "http://localhost.test";
const storage = new MemoryWebSubStorage();
const env = { WEBSUB_DAILY_DELIVERY_LIMIT: "2500" };

async function fetchWithCallbackVerification(url, init) {
  const parsed = new URL(url);
  if (parsed.hostname === "subscriber.example") {
    return new Response(parsed.searchParams.get("hub.challenge") || "", { status: 200 });
  }
  return fetch(url, init);
}

async function request(path, init = {}) {
  return routeRequest(new Request(`${origin}${path}`, init), {
    env,
    storage,
    fetch: fetchWithCallbackVerification,
    webSubHubUrl: (requestOrigin) => hubUrlFor(requestOrigin, env),
  });
}

async function text(path, init = {}) {
  const response = await request(path, init);
  return {
    response,
    body: await response.text(),
  };
}

async function json(path) {
  const response = await request(path);
  return {
    response,
    body: await response.json(),
  };
}

const rss = await text("/@hi176.xml");
assert.equal(rss.response.status, 200);
assert.match(rss.response.headers.get("content-type") || "", /application\/rss\+xml; charset=utf-8/);
assert.match(rss.response.headers.get("cache-control") || "", /s-maxage=900/);
assert.match(rss.response.headers.get("link") || "", /rel="hub"/);
assert.match(rss.body, /<rss version="2.0"/);
assert.match(rss.body, /<channel>/);
assert.match(rss.body, /rel="hub"/);
assert.match(rss.body, /xmlns:content="http:\/\/purl\.org\/rss\/1\.0\/modules\/content\/"/);
assert.match(rss.body, /<content:encoded><!\[CDATA\[/);
assert.match(rss.body, /https:\/\/matters\.town\/a\//);

const encodedRss = await text("/%40hi176.xml");
assert.equal(encodedRss.response.status, 200);
assert.match(encodedRss.response.headers.get("content-type") || "", /application\/rss\+xml; charset=utf-8/);
assert.match(encodedRss.response.headers.get("link") || "", /%40hi176\.xml/);
assert.match(encodedRss.body, /<rss version="2.0"/);
assert.match(encodedRss.body, /<channel>/);
assert.match(encodedRss.body, /href="http:\/\/localhost\.test\/%40hi176\.xml" rel="self"/);

const blogtrottrHead = await request("/@hi176.xml", {
  method: "HEAD",
  headers: { "user-agent": "Blogtrottr" },
});
assert.equal(blogtrottrHead.status, 200);
assert.match(blogtrottrHead.headers.get("content-type") || "", /application\/rss\+xml; charset=utf-8/);

const w3cValidatorGet = await text("/%40hi176.xml", {
  headers: { "user-agent": "W3C_Validator" },
});
assert.equal(w3cValidatorGet.response.status, 200);
assert.match(w3cValidatorGet.response.headers.get("content-type") || "", /application\/rss\+xml; charset=utf-8/);

const preview = await json("/api/preview?user=hi176");
assert.equal(preview.response.status, 200);
assert.equal(preview.body.user.userName, "hi176");
assert.ok(Array.isArray(preview.body.articles));
assert.ok(preview.body.articles.length > 0);
assert.match(preview.body.feedUrl, /\/@hi176\.xml$/);

const invalid = await json("/api/preview?user=bad!");
assert.equal(invalid.response.status, 400);

const unknown = await json("/api/preview?user=unknown_user_20260508");
assert.equal(unknown.response.status, 404);

const form = new FormData();
form.set("hub.mode", "subscribe");
form.set("hub.topic", `${origin}/@hi176.xml`);
form.set("hub.callback", "https://subscriber.example/callback");
form.set("hub.verify", "sync");
const subscribed = await routeRequest(new Request(`${origin}/websub/hub`, {
  method: "POST",
  body: form,
}), {
  env,
  storage,
  fetch: fetchWithCallbackVerification,
  webSubHubUrl: (requestOrigin) => hubUrlFor(requestOrigin, env),
});
assert.equal(subscribed.status, 202);

const webSubStatus = await json("/api/websub/status?user=hi176");
assert.equal(webSubStatus.response.status, 200);
assert.equal(webSubStatus.body.enabled, true);
assert.equal(webSubStatus.body.subscriberCount, 1);
assert.match(webSubStatus.body.hubUrl, /\/websub\/hub$/);

console.log("Smoke tests passed.");
