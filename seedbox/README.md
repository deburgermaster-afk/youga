# Seedbox

A self-hosted cloud torrent client, similar in spirit to Seedr. Paste a magnet link or drop in a `.torrent` file. Your server downloads it at datacenter speed. You can then stream it at the original quality, download it over HTTPS, or open it straight in VLC, MX Player or Infuse.

## Features

- **Live dashboard:** animated download and upload speed dials, a 60-second speed graph, peer count, ratio and storage usage. Updates arrive every second over Server-Sent Events.
- **Speed limits:** sliders for the download and upload (seeding) limits, from 64 KB/s to unlimited. The active limit shows as a red marker on each dial.
- **Folders:** each torrent's files appear in a collapsible tree.
- **Server files tab:** browse, play, download or delete everything stored on the server.
- **Original-quality streaming:** files are not re-encoded, and seeking works through HTTP Range requests. You can start watching before a download finishes, because the parts you're watching are fetched first.
- **Open in player apps:**
  - Android: VLC, MX Player, Just Player, or the system app chooser
  - iOS: VLC, Infuse, nPlayer, Outplayer
  - Desktop: VLC, PotPlayer, IINA
- **Auto-open on mobile:** when enabled, tapping Play launches your preferred player app.
- **Shareable links:** copy a stream or download link per file, copy all links at once, or get an M3U playlist per torrent. Links carry a token, so they work in apps that can't log in.
- **Password login:** protects the whole server. Torrents resume after restarts.
- **UI stack:** built with shadcn/ui, Tailwind v4 and Motion, with animated code-rain and glow backgrounds that respect reduced-motion settings.

## Run locally

```bash
npm install
npm run build      # builds the web UI into ./public
npm start          # http://localhost:3000
```

For UI development, run `npm run dev` here and `npm run dev --prefix web` in a second terminal. Vite proxies API calls to port 3000.

## Environment variables

| Variable       | Default        | Purpose                                     |
|----------------|----------------|---------------------------------------------|
| `PORT`         | `3000`         | HTTP port                                   |
| `DOWNLOAD_DIR` | `./downloads`  | Where files are stored (mount a volume)     |
| `APP_PASSWORD` | *(none)*       | Login password (strongly advised)           |

Changing `APP_PASSWORD` invalidates every shared link and every login session.

## Deploy on Railway

The repo includes a `Dockerfile` and a `railway.json`.

1. Create a service from this repo and set its root directory to `/seedbox`.
2. Attach a volume at `/data`.
3. Set `APP_PASSWORD`.
4. Generate a domain.

Railway's free and trial plans cap volumes at 0.5 GB. A paid plan is needed to store full-HD movies.

## Notes

- Download speed depends on how many peers are seeding and on your server's bandwidth.
- Only download content you have the rights to, such as public-domain films, Linux ISOs and Creative Commons media.
