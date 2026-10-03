# Cloudbox

A version of Seedbox that runs entirely on Cloudflare's free plan. Paste a **direct download link** and a Cloudflare Worker copies the file into your R2 bucket. You can then Play, Copy or Download it from anywhere, with no server or PC of your own.

- **Paste to start:** pasting a link begins the copy immediately.
- **Big files:** copied in 100 MB pieces using HTTP Range requests, which handles files up to 5 GB, or larger if the source supports resuming.
- **Keeps going without the app:** a cron trigger runs every minute to continue copies. With the app open, it copies faster.
- **Pause, resume, retry and cancel** copies at any time.
- **Streams straight from R2,** with seeking. Copied links work in VLC, MX Player and Infuse.
- **Password login.** Black-and-white, mobile-first shadcn/ui, with a floating bottom bar.

**Magnet links** work through [TorBox](https://torbox.app), because Workers can't run BitTorrent:
1. TorBox downloads the torrent (step 1).
2. Each file is then copied into R2 with its folders kept (step 2).

Add your TorBox API key in **Settings**; it's stored privately in your bucket. TorBox's free plan gives 20 GB a month with files up to 1 GB. Paid plans start at $3/month.

## Deploy

```bash
npm install
npm run build                         # builds the UI into ./public
npx wrangler secret put APP_PASSWORD  # choose your login password
npx wrangler deploy
```

`wrangler.jsonc` binds the R2 bucket `seedbox-files` and sets up the every-minute cron.

## Free-plan limits it's built around

| Limit | Value |
|---|---|
| CPU time per request | 10 ms (waiting on the network doesn't count, so streaming is cheap) |
| Network calls per request | 50 |
| Cron run length | 15 minutes, up to 8 pieces per job each run |
| Requests | 100,000 per day |
| R2 storage | 10 GB free, then $0.015 per GB per month; downloads out of R2 are free |
