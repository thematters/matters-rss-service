# Matters RSS Service Execution Plan

Date: 2026-05-08
Owner: Matters product/engineering
Status: Local MVP implemented with Cloudflare Free-tier WebSub path

## Goal

Ship a standalone public RSS service for Matters authors without adding monthly fixed cost. Keep the service separate from `matters.town` until usage proves the feature is worth native site integration.

## Scope

Phase 1 ships:

- public author RSS feeds at `https://rss.matters.town/@{userName}.xml`
- a standalone service page that helps readers follow authors without learning RSS first
- recent public active articles only
- Cloudflare Worker + D1 on the free tier for WebSub subscriber state
- no object storage or paid worker plan requirement
- no changes to `matters-web` navigation or profile pages

Out of scope for Phase 1:

- private RSS links for a user's subscriptions
- paid/circle-only content in RSS
- IPNS/Planet publishing recovery
- adding a profile-page RSS icon on `matters.town`
- durable storage, analytics pipeline, or email delivery

## Product Contract

The service page should be positioned as:

> Follow this author without relying on algorithms or missing notifications.

The first-run UX should do only four jobs:

1. Accept a Matters username or profile URL.
2. Generate a stable subscription URL.
3. Let the user copy/open the feed and preview recent public articles.
4. Offer simple next steps for Feedly/Inoreader, email updates, and Telegram automation.

Avoid leading with "what is RSS". Use plain use cases instead:

- Read updates in Feedly, Inoreader, NetNewsWire, Reeder, NewsBlur, or similar readers.
- Receive author updates by email through RSS-to-email services.
- Send new article notifications to Telegram or other automation tools.
- Give advanced users the raw RSS URL.

The RSS endpoint should:

- return RSS 2.0 XML
- use `application/rss+xml; charset=utf-8`
- list up to 50 recent public active articles
- filter out `noindex` articles
- use `https://matters.town/a/{shortHash}` for item links and GUIDs
- include title, summary, publication date, tags, and author metadata
- never expose paywalled or private content

## Technical Approach

Create a standalone project at `external/matters-rss-service` for MVP work. This folder is a temporary local implementation workspace; the canonical product repo should become `thematters/matters-rss-service` if the MVP is accepted.

Use:

- static HTML/CSS/JS for the service page
- vendored `thematters/design-system` tokens and Button CSS
- Cloudflare Worker for static assets, dynamic RSS, preview JSON, WebSub hub, and cron polling
- Cloudflare D1 free tier for WebSub subscriber registrations and delivery guardrails
- existing public GraphQL endpoint `https://server.matters.town/graphql`

Avoid:

- R2/KV storage
- paid queues/workers
- IPFS/IPNS republish jobs
- client-side direct calls to Matters GraphQL

## Cost Boundary

Expected fixed monthly cost: `$0`.

The MVP uses Cloudflare Worker static assets, Cron Triggers, and D1 within free-tier constraints. RSS responses include edge-cache headers so feed-reader polling should be absorbed by CDN where possible.

Recommended headers:

- `Cache-Control: public, max-age=0, s-maxage=900, stale-while-revalidate=86400`
- `CDN-Cache-Control: public, max-age=900, stale-while-revalidate=86400`

If usage exceeds the free tier, treat that as the product signal for native integration and budget review, not as an automatic paid-service migration.

## WebSub Free-Tier Work Item

WebSub is now a formal work item, implemented on Cloudflare Free tier first.

Goal:

- make RSS usable as a near-real-time automation trigger without adding monthly spend
- keep the public RSS service stable even if WebSub reaches free-tier limits
- avoid requiring ordinary readers to understand WebSub

Free-tier architecture:

- Cloudflare Worker endpoint for WebSub hub requests
- D1 for subscriber registrations, using only free-tier storage and operations
- direct low-volume outbound delivery first; Cloudflare Queue can be added later if fan-out grows
- Cron Trigger for polling authors with active subscriptions until Matters has a native article-published event
- hard daily caps so WebSub delivery pauses instead of creating paid usage

Formal WebSub tasks:

1. Add `rel="hub"` and `rel="self"` discovery after the hub endpoint passes verification.
2. Implement subscribe/unsubscribe challenge verification.
3. Store callback URL, topic URL, lease expiry, and optional secret.
4. Poll only authors with active WebSub subscribers.
5. Detect new article GUIDs without storing article bodies.
6. Deliver RSS payloads to subscribed callbacks.
7. Add a daily free-tier usage guardrail and visible degraded state.
8. Keep RSS polling fully functional even when WebSub is paused.

Acceptance criteria:

- monthly fixed cost remains `$0`
- WebSub can be disabled without breaking RSS
- free-tier overage causes graceful pause/fallback, not silent failure
- ordinary readers still see the same simple "follow author" page
- advanced tools can discover and subscribe through standard WebSub flow

Current local WebSub implementation:

- `/websub/hub` supports discovery plus subscribe/unsubscribe verification.
- RSS responses include `Link: rel="self"` and `Link: rel="hub"` headers.
- RSS XML includes `atom:link rel="self"` and `atom:link rel="hub"`.
- `/api/websub/status?user={userName}` exposes a user-friendly degraded-state check for the page.
- `worker/index.js` adds a Cloudflare Worker `scheduled` handler for cron polling.
- `migrations/0001_websub.sql` defines D1 tables for subscriptions, topic state, usage guardrails, and delivery logs.
- `wrangler.example.jsonc` documents the Cloudflare route, D1 binding, static assets binding, and 15-minute cron.

## Email Subscription Finding

Embedding third-party RSS-to-email inside this page is possible only with constraints:

- Blogtrottr has a REST API for account-owned subscriptions, but it requires a bearer token and creates subscriptions inside that Blogtrottr account. Additional delivery addresses require verified email addresses. This is not appropriate for silently subscribing arbitrary Matters readers through a Matters-owned token.
- follow.it supports embedded follow forms, but the action URL is feed-specific and normally comes from a publisher setup flow. Its generic `api.follow.it/subscribe` path depends on publisher/feed setup and referer context, so it is not a safe universal dynamic form for every Matters author feed.
- The MVP should not collect reader email addresses unless Matters is ready to run its own confirmation, unsubscribe, privacy, and deliverability flow.

Current UX decision:

- provide reader-owned Email flow by opening an email draft to `add@rssby.email` with the RSS URL in the body
- keep Blogtrottr/follow.it as external options
- avoid storing or proxying reader email addresses in the RSS service

## Implementation Tasks

1. Build the static service page.
2. Add URL parsing for `@user`, `user`, and `https://matters.town/@user`.
3. Add RSS URL generation and copy/open actions.
4. Add simple follow options for RSS readers, email, and Telegram.
5. Add RSS API for latest 50 public articles.
6. Add XML escaping and invalid-character stripping.
7. Add username validation and safe failure states.
8. Add local smoke tests for XML, preview JSON, headers, 404, and invalid input.
9. Validate with `@hi176` as the first known account.
10. Add WebSub Free-tier implementation behind the advanced section of the page.
11. Keep Email follow as a reader-owned flow unless Matters approves first-party email subscriptions.

## Deployment Plan

1. Deploy the standalone service to Cloudflare Worker.
2. Bind `rss.matters.town` only after the preview deployment passes.
3. Share the service with the original requester and a small author group.
4. Observe request volume and user feedback.
5. Decide whether to integrate into `matters-web`.

## Native Integration Gate

Do not integrate into `matters.town` until at least one of these is true:

- multiple authors actively share their RSS URLs
- feed-reader traffic is stable for several weeks
- support load is low and RSS reader compatibility is confirmed
- product decides profile-page discoverability is worth the added UI surface

Native integration should then add:

- profile-page RSS icon
- `<link rel="alternate" type="application/rss+xml">`
- a short help page
- monitoring and abuse controls if traffic warrants it

## Verification

MVP acceptance requires:

- `/@hi176.xml` returns valid RSS XML
- `/api/preview?user=hi176` returns recent public articles
- invalid usernames return `400`
- unknown users return `404`
- `noindex` articles are excluded
- no paid storage or database service is required; D1 must remain within free-tier guardrails
- service page works on desktop and mobile

Current local verification on 2026-05-08:

- `node scripts/smoke-test.mjs` passed against the live Matters GraphQL API.
- `http://localhost:8788/` returned the standalone service page.
- `http://localhost:8788/@hi176.xml` returned RSS XML with RSS cache headers.
- `http://localhost:8788/api/preview?user=hi176` returned Matty's latest public articles.
- Browser interaction generated the feed URL and rendered three preview articles without console errors.
- WebSub subscribe challenge and `/api/websub/status?user=hi176` passed in local smoke tests.
- Browser interaction opened the advanced WebSub details without console errors.
