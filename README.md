# Lester Apps Public

Authenticated GitHub Pages frontend for Lester Apps. A Cloudflare Worker verifies Google Sign-In, enforces a two-account allowlist, maintains 24-hour secure sessions, and proxies approved Apps Script summary endpoints.

Secrets are never stored in this repository. See `worker/wrangler.toml` for non-secret configuration. Configure `SESSION_SECRET` and any `APP_SHARED_TOKEN` with `wrangler secret put`.
