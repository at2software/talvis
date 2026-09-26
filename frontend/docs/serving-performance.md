# Serving performance

Notes on why the TALVIS UI felt slow and what was done about it. The application code was not the
bottleneck — Angular is zoneless, every component is `OnPush` and every `@for` is tracked. What
made it slow was how assets and avatars were being *served*.

Measured against `https://nexus.at2.me/de/dashboard`, 2026-07-29.

## Applied to the production host (done)

Both files were backed up as `*.bak-20260729-132945` before editing; rollback is a copy back plus
`systemctl reload nginx`.

### `gzip on` was set but `gzip_types` was not

nginx's built-in default for `gzip_types` is `text/html` only, so the commented-out line in
`/etc/nginx/nginx.conf` meant HTML was compressed and nothing else was. `encodedBodySize` equalled
`decodedBodySize` on every JS and CSS asset.

| | before | after |
|---|---|---|
| `main.js` | 1788 kB | 491 kB |
| `styles.css` | 292 kB | 43 kB |

### HTTP/1.1

`listen 443 ssl;` had no `http2 on;`. With six connections per origin and ~100 avatar requests in
flight, individual requests were observed taking 6–7 s purely queueing, and lazy route chunks
queued behind them. Now `h2`, so those requests multiplex.

### No `Cache-Control` on static assets

Nothing set it, so every navigation revalidated the bundle, and the 239 kB loader animation
(`assets/nexus-loading/nexus_loading.webp`) was re-requested each time.

A `$asset_cache_control` map in the `http` context drives an `add_header` in the `/en/`, `/de/`
and `/` locations. An empty map value makes nginx omit the header, so only two shapes get one:

- content-hashed bundles → `public, max-age=31536000, immutable`
- anything under `assets/` (names are stable across deploys) → `public, max-age=86400, must-revalidate`

`index.html` matches neither and stays uncached, which is what lets a deploy take effect.

The `auth_request /oauth2/auth` on those locations was left untouched — assets are still behind
SSO, verified by an unauthenticated `curl` still receiving a 302.

## Applied in the code (pending deploy)

### Avatars were declared uncacheable

`Vcard::getPhotoResponse()` sent `Cache-Control: no-cache, no-store, must-revalidate`, so every
avatar was re-fetched on every page and every SPA navigation — each one a full Laravel boot plus a
vCard parse. A project list carries 321 `<img>` tags pointing at `/backend/api/*/icon`, resolving
to 73 distinct URLs and only ~43 distinct images.

Now `private, max-age=86400` with an ETag, so an expired entry revalidates as a bodyless 304.

`Project.computedIcon` additionally addresses `companies/:id/icon` directly — the backend resolved
`projects/:id/icon` to the company's image anyway, so project-shaped URLs were giving one image
many names and defeating the cache. As a bonus this moves project avatars onto the
`^/backend(/api/(?:users|companies)/[0-9]+/icon)$` location in the production config, which skips
the oauth2 subrequest.

### Avatars shared the API rate-limit budget

`RateLimiter::for('api')` allows 300 requests/minute. One visit to the project list spent 74 of
them on avatars. Four navigations inside a minute exhausted the budget and the API began answering
429 — including the detail route's guard fetch, which cancelled the navigation and left a shell
with no content. That is the "empty page that only comes back after F5" symptom.

Avatars now use a separate `icons` limiter, and `DetailGuard` reports the failure instead of
silently returning `false`.

### The activity sidebar outran the routed page

Thirteen background resources fired at bootstrap from the collapsed sidebar, taking the whole
connection pool before the routed view asked for anything. They now wait for
`requestIdleCallback` (`src/constants/idle.ts`).

## Verifying

From the browser console on a loaded page:

```js
const r = performance.getEntriesByType('resource').find(r => r.name.includes('/main-'));
({ compressed: r.encodedBodySize !== r.decodedBodySize, protocol: r.nextHopProtocol });
// want: { compressed: true, protocol: 'h2' }

// after the backend deploy, this should stop growing on a second navigation:
performance.getEntriesByType('resource').filter(r => r.name.includes('/icon')).length;
```
