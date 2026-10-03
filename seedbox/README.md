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
| `HOST`         | all interfaces | Bind address (`127.0.0.1` behind a proxy)   |
| `TORRENT_PORT` | random         | Fixed peer port to open in the firewall     |

Changing `APP_PASSWORD` invalidates every shared link and every login session.

## Free hosting with 200 GB (Oracle Cloud Always Free)

Oracle's Always Free tier includes a VM and **200 GB of disk** at no cost. It doesn't expire. Signing up needs a card for identity verification, but you aren't charged as long as you stay within the free limits.

1. **Sign up** at <https://signup.cloud.oracle.com>. Pick a home region close to you; you can't change it later.
2. **Create a VM.** Go to Compute → Instances → Create instance.
   - **Image:** Canonical Ubuntu 24.04.
   - **Shape:** Ampere `VM.Standard.A1.Flex`, with as many OCPUs and as much RAM as the free tier allows.
     - If you get "out of capacity", try again later or pick another availability domain.
     - `VM.Standard.E2.1.Micro` also works, but it has only 1 GB of RAM.
   - **Boot volume:** tick *Specify a custom boot volume size* and enter **200** GB.
   - **SSH key:** you can download the generated key. You only need it to log in to the server, which is optional.
   - **Initialization script:** open *Show advanced options* → *Management* → *Paste cloud-init script*, then paste the script below with your own password. The password needs at least 8 characters and no quotes, `\`, `$`, backticks or spaces.

     ```bash
     #!/bin/bash
     export APP_PASSWORD='pick-a-strong-password'
     curl -fsSL https://raw.githubusercontent.com/deburgermaster-afk/youga/seedbox/seedbox/deploy/oracle-install.sh | bash
     ```
3. **Open the ports.** Go to Networking → Virtual cloud networks → your VCN → Security Lists → Default → Add Ingress Rules. Use source `0.0.0.0/0` for each rule:
   - TCP port `80`
   - TCP port `443`
   - TCP port `6881`
   - UDP port `6881`
4. Wait about 10 minutes for the install to finish. Then open `https://<public-ip-with-dashes>.sslip.io`.
   - Example: for IP `140.238.1.2`, open `https://140-238-1-2.sslip.io`.
   - The public IP is shown on the instance's page.
   - If the address doesn't load, the install log is at `/var/log/seedbox-install.log` on the server.

To update the app later, SSH in and run `sudo seedbox-update`.

Oracle may reclaim Always Free VMs that stay idle (very low CPU, network and memory use) for 7 days. Upgrading the account to Pay As You Go prevents that. Anything within the free limits is still free.

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
