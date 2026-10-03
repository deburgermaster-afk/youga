# Seedbox

A self-hosted cloud torrent client, similar in spirit to Seedr. Paste a magnet link or upload a `.torrent`. Your server downloads it at datacenter speed. You can then stream it in the browser or download it over plain HTTPS.

- Streams at the original quality, with no re-encoding. Seeking works because the server supports HTTP Range requests.
- You can play a video while it is still downloading. The server fetches the parts you are watching first.
- Pause, resume, and remove torrents, with the option to delete the files too.
- Torrents resume automatically after a restart or redeploy.
- Optional password protection through `APP_PASSWORD`.

## Run locally

```bash
npm install
npm start          # http://localhost:3000
```

## Environment variables

| Variable       | Default        | Purpose                                   |
|----------------|----------------|-------------------------------------------|
| `PORT`         | `3000`         | HTTP port                                 |
| `DOWNLOAD_DIR` | `./downloads`  | Where files are stored (mount a volume)   |
| `APP_PASSWORD` | *(none)*       | Enables basic-auth login (strongly advised) |

## Deploy (Railway)

1. Create a service from this folder. Railway detects Node and runs `npm start`.
2. Attach a **Volume** mounted at `/data` and set `DOWNLOAD_DIR=/data`.
3. Set `APP_PASSWORD`.
4. Generate a public domain.

Your host must allow inbound and outbound BitTorrent traffic (TCP/UDP). Serverless platforms such as Vercel will **not** work, because they can't hold peer connections or long downloads.

## Notes

- Speed depends on how many peers are seeding and on your server's bandwidth.
- Storage is limited by the size of your volume. Remove torrents you are done with.
- Only download content you have the rights to, such as public-domain films, Linux ISOs, and Creative Commons media.
