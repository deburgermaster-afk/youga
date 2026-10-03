#!/bin/bash
# Seedbox installer for an Oracle Cloud "Always Free" VM (Ubuntu 22.04/24.04, ARM or x86).
#
# Easiest use: paste this as the instance's cloud-init script, with your password:
#
#   #!/bin/bash
#   export APP_PASSWORD='pick-a-strong-password'
#   curl -fsSL https://raw.githubusercontent.com/deburgermaster-afk/youga/seedbox/seedbox/deploy/oracle-install.sh | bash
#
# Re-running it is safe; it updates the app to the latest commit.
# When done, the app is at https://<public-ip-with-dashes>.sslip.io
set -euo pipefail

APP_PASSWORD="${APP_PASSWORD:-}"
REPO="${REPO:-https://github.com/deburgermaster-afk/youga.git}"
BRANCH="${BRANCH:-seedbox}"
TORRENT_PORT="${TORRENT_PORT:-6881}"
APP_DIR=/opt/seedbox
DATA_DIR=/srv/seedbox
ENV_FILE=/etc/seedbox.env

exec > >(tee -a /var/log/seedbox-install.log) 2>&1
echo "=== Seedbox install started $(date) ==="

if [ "$(id -u)" -ne 0 ]; then echo "Run as root (sudo)." >&2; exit 1; fi

# Keep an existing password on re-runs; otherwise generate one if none was given.
if [ -z "$APP_PASSWORD" ] && [ -f "$ENV_FILE" ]; then
  APP_PASSWORD="$(sed -n 's/^APP_PASSWORD="\(.*\)"$/\1/p' "$ENV_FILE")"
fi
if [ -z "$APP_PASSWORD" ]; then
  APP_PASSWORD="$(head -c 18 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 16)"
  echo "No APP_PASSWORD given; generated one (see /root/seedbox-info.txt)."
fi

case "$APP_PASSWORD" in
  *[\"\\\$\`\']*|*[[:space:]]*) echo "APP_PASSWORD must not contain quotes, backslashes, \$, backticks or spaces." >&2; exit 1 ;;
esac
if [ "${#APP_PASSWORD}" -lt 8 ]; then echo "APP_PASSWORD must be at least 8 characters." >&2; exit 1; fi

export DEBIAN_FRONTEND=noninteractive
export HOME="${HOME:-/root}"  # cloud-init may run without HOME; npm needs it

# Small VMs (1 GB RAM) need swap to build the web UI.
if [ "$(awk '/MemTotal/ {print $2}' /proc/meminfo)" -lt 4000000 ] && ! swapon --show | grep -q /swapfile; then
  fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

apt-get update
apt-get install -y ca-certificates curl gnupg git build-essential python3 \
  iptables-persistent debian-keyring debian-archive-keyring apt-transport-https

# Node.js 22
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 20 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

# Caddy (automatic HTTPS)
if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update
  apt-get install -y caddy
fi

# App user, code and build
id seedbox >/dev/null 2>&1 || useradd --system --create-home --home-dir /var/lib/seedbox --shell /usr/sbin/nologin seedbox
mkdir -p "$DATA_DIR"
chown seedbox:seedbox "$DATA_DIR"

if [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" fetch --depth 1 origin "$BRANCH"
  git -C "$APP_DIR" reset --hard FETCH_HEAD
else
  git clone --depth 1 --branch "$BRANCH" "$REPO" "$APP_DIR"
fi
cd "$APP_DIR/seedbox"
npm ci --omit=dev
npm run build
chown -R seedbox:seedbox "$APP_DIR"

# Config
umask 077
cat > "$ENV_FILE" <<EOF
PORT=3000
HOST=127.0.0.1
DOWNLOAD_DIR=$DATA_DIR
TORRENT_PORT=$TORRENT_PORT
APP_PASSWORD="$APP_PASSWORD"
EOF
# Optional Cloudflare R2 (or any S3) storage for finished downloads.
for v in R2_ACCOUNT_ID R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY R2_BUCKET S3_ENDPOINT; do
  if [ -n "${!v:-}" ]; then echo "$v=${!v}" >> "$ENV_FILE"; fi
done
umask 022

cat > /etc/systemd/system/seedbox.service <<EOF
[Unit]
Description=Seedbox
After=network-online.target
Wants=network-online.target

[Service]
User=seedbox
EnvironmentFile=$ENV_FILE
WorkingDirectory=$APP_DIR/seedbox
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=3
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
EOF

# Firewall: Oracle's Ubuntu images block everything but SSH by default.
for proto in tcp udp; do
  iptables -C INPUT -p "$proto" --dport "$TORRENT_PORT" -j ACCEPT 2>/dev/null || iptables -I INPUT 1 -p "$proto" --dport "$TORRENT_PORT" -j ACCEPT
done
for port in 80 443; do
  iptables -C INPUT -p tcp --dport "$port" -j ACCEPT 2>/dev/null || iptables -I INPUT 1 -p tcp --dport "$port" -j ACCEPT
done
netfilter-persistent save || true

# HTTPS on a free hostname that maps to this server's IP.
PUBLIC_IP="$(curl -fsS --max-time 10 https://api.ipify.org || curl -fsS --max-time 10 https://ifconfig.me)"
DOMAIN="${DOMAIN:-${PUBLIC_IP//./-}.sslip.io}"
cat > /etc/caddy/Caddyfile <<EOF
$DOMAIN {
	reverse_proxy 127.0.0.1:3000 {
		flush_interval -1
	}
}
EOF

# Update helper: `sudo seedbox-update`
cat > /usr/local/bin/seedbox-update <<'EOF'
#!/bin/bash
set -euo pipefail
cd /opt/seedbox
git fetch --depth 1 origin "$(git rev-parse --abbrev-ref HEAD)"
git reset --hard FETCH_HEAD
cd seedbox
npm ci --omit=dev
npm run build
chown -R seedbox:seedbox /opt/seedbox
systemctl restart seedbox
echo "Updated."
EOF
chmod +x /usr/local/bin/seedbox-update

systemctl daemon-reload
systemctl enable --now seedbox
systemctl restart seedbox
systemctl enable caddy
systemctl restart caddy

cat > /root/seedbox-info.txt <<EOF
Seedbox is running.
URL:      https://$DOMAIN
Password: $APP_PASSWORD
Files:    $DATA_DIR
Logs:     journalctl -u seedbox -f
Update:   sudo seedbox-update
EOF
chmod 600 /root/seedbox-info.txt

echo "=== Seedbox ready: https://$DOMAIN ==="
