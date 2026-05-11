# Matters RSS Service

Standalone MVP for public Matters author and channel RSS feeds.

Live service: `https://rss.matters.town/`

## What it does

- Serves public author feeds at `/@{userName}.xml`
- Serves public Matters channel feeds at `/channel/{shortHash}.xml`
- Includes public article HTML in `content:encoded`; paywalled/circle and `noindex` articles are excluded
- Accepts both `/@{userName}.xml` and `/%40{userName}.xml`
- Provides a reader-friendly service page for creating stable author and channel subscription links
- Offers simple next steps for RSS readers, email updates, and Telegram automation
- Exposes a WebSub hub at `/websub/hub` for tools that support near-real-time updates
- Uses public Matters GraphQL data only
- Uses vendored Matters Design System tokens and Button CSS
- Adds no database, object storage, or paid monthly service dependency

## WebSub

The WebSub implementation is designed for Cloudflare Free tier first:

- D1 stores subscribers, topic state, usage counters, and delivery logs.
- Worker cron polls only topics with active subscribers.
- Daily delivery caps pause WebSub without breaking normal RSS polling.
- RSS includes `rel="hub"` and `rel="self"` discovery.

Apply the D1 schema in `migrations/0001_websub.sql` before deployment.

## Local run

Use the bundled Node runtime if `node` is not on PATH:

```bash
node scripts/dev-server.mjs
```

Then open:

- `http://localhost:8788/`
- `http://localhost:8788/@hi176.xml`
- `http://localhost:8788/api/preview?user=hi176`
- `http://localhost:8788/channel/nycmlq5d4w8a.xml`
- `http://localhost:8788/api/channels`

## Tests

```bash
npm test
```

`npm test` covers URL generation, external subscription links, `mailto:` generation,
`/@{userName}.xml`, `/%40{userName}.xml`, RSS content type, full-content output,
`/channel/{shortHash}.xml`, WebSub author/channel topics, and `noindex` / paywall filtering.

## Deploy shape

This MVP can run as either Cloudflare Pages Functions or a Cloudflare Worker.

For public launch, prefer the Worker shape because WebSub needs Cron Triggers:

- `public/` contains static assets.
- `worker/index.js` handles static assets, RSS, preview JSON, WebSub hub, and cron polling.
- `migrations/0001_websub.sql` defines the D1 schema.
- `wrangler.example.jsonc` documents the route, assets binding, D1 binding, and cron schedule.

The production hostname is `rss.matters.town`.

## RSS Reader Compatibility

Cloudflare Browser Integrity Check can block some feed clients before the Worker runs.
If readers or RSS-to-email services receive `403` with Cloudflare `error code: 1010`,
add a Cloudflare configuration rule for `rss.matters.town` that disables Browser
Integrity Check for this hostname or for `*.xml` feed paths only.

Suggested expression:

```text
(http.host eq "rss.matters.town" and http.request.uri.path matches "^/((%40|@)[A-Za-z0-9_-]+|channel/[A-Za-z0-9_-]+)\\.xml$")
```

Suggested configuration setting:

```json
{ "bic": false }
```

## Design System

Vendored from `thematters/design-system` at:

`314d174892124da6c9cf46e53bda35a3c2c7baaf`

Included files:

- `public/assets/matters-ds/tokens/tokens.css`
- `public/assets/matters-ds/components/button.css`
