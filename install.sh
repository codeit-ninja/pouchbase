#!/usr/bin/env bash
#
# Installs Pouchbase on a Linux server (a VPS) with Docker:
#
#   curl -fsSL https://raw.githubusercontent.com/pouchbase/pouchbase/main/install.sh | sudo bash
#
# Installs Docker when it is missing, asks for the Cloudflare credentials (the data lives on D1 and
# R2) and checks them, then starts the published image with Docker Compose in /opt/pouchbase. With a
# domain name, Caddy runs in front of it and gets an HTTPS certificate from Let's Encrypt; without
# one, Pouchbase only listens on localhost, because the session cookie is only sent over HTTPS.
#
# Run it again to change the settings or to update to the latest image; the answers of the previous
# run are the defaults. Every question can be answered up front with an environment variable, which
# makes the script non-interactive:
#
#   CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN   Cloudflare credentials
#   POUCHBASE_DOMAIN                              Domain name for HTTPS, or `none` for localhost only
#   POUCHBASE_DIR                                 Install directory (default /opt/pouchbase)
#   POUCHBASE_VERSION                             Image tag (default latest)
#   POUCHBASE_PORT                                Port on localhost without a domain (default 3000)

# Everything runs from main(), so a download that breaks off halfway never runs a partial script.
set -euo pipefail

POUCHBASE_DIR="${POUCHBASE_DIR:-/opt/pouchbase}"
POUCHBASE_VERSION="${POUCHBASE_VERSION:-latest}"
IMAGE="ghcr.io/pouchbase/pouchbase:${POUCHBASE_VERSION}"
CLOUDFLARE_API="https://api.cloudflare.com/client/v4"

if [ -t 1 ]; then
	BOLD=$'\033[1m'
	DIM=$'\033[2m'
	RED=$'\033[31m'
	GREEN=$'\033[32m'
	YELLOW=$'\033[33m'
	RESET=$'\033[0m'
else
	BOLD='' DIM='' RED='' GREEN='' YELLOW='' RESET=''
fi

step() { printf '\n%s==>%s %s%s%s\n' "$GREEN" "$RESET" "$BOLD" "$*" "$RESET"; }
info() { printf '    %s\n' "$*"; }
warn() { printf '%sWarning:%s %s\n' "$YELLOW" "$RESET" "$*" >&2; }
fail() {
	printf '%sError:%s %s\n' "$RED" "$RESET" "$*" >&2
	exit 1
}

# Whether questions can be asked: stdin is the script itself when it is piped into bash, so the
# answers are read from the terminal instead.
has_tty() { [ -r /dev/tty ] && [ -w /dev/tty ] && { : </dev/tty; } 2>/dev/null; }

# ask <variable> <question> [default] [secret]: sets the variable to the answer, or to the default
# when the answer is empty. A secret is read without echo and its default is not shown.
ask() {
	local name="$1" question="$2" default="${3:-}" secret="${4:-}" prompt answer

	if ! has_tty; then
		[ -n "$default" ] || fail "$name is required. Run the script in a terminal, or set $name."
		printf -v "$name" '%s' "$default"
		return
	fi

	prompt="$question"

	if [ -n "$default" ] && [ -n "$secret" ]; then
		prompt="$prompt ${DIM}[keep current]${RESET}"
	elif [ -n "$default" ]; then
		prompt="$prompt ${DIM}[$default]${RESET}"
	fi

	if [ -n "$secret" ]; then
		IFS= read -r -s -p "$prompt: " answer </dev/tty
		printf '\n' >/dev/tty
	else
		IFS= read -r -p "$prompt: " answer </dev/tty
	fi

	printf -v "$name" '%s' "${answer:-$default}"
}

# The value of a key in an existing .env file, without surrounding quotes.
env_value() {
	local file="$POUCHBASE_DIR/.env"

	[ -f "$file" ] || return 0
	sed -n "s/^$1=//p" "$file" | tail -n 1 | sed -e "s/^['\"]//" -e "s/['\"]\$//"
}

check_system() {
	[ "$(uname -s)" = "Linux" ] || fail "This script installs Pouchbase on Linux. On other systems, see https://github.com/pouchbase/pouchbase#self-hosting."

	if [ "$(id -u)" -ne 0 ]; then
		fail "Run this script as root, for example: curl -fsSL https://raw.githubusercontent.com/pouchbase/pouchbase/main/install.sh | sudo bash"
	fi

	command -v curl >/dev/null || fail "curl is required."
}

install_docker() {
	step "Docker"

	if command -v docker >/dev/null; then
		info "Found $(docker --version)."
	else
		info "Installing Docker with the official script from get.docker.com..."
		curl -fsSL https://get.docker.com | sh
	fi

	if command -v systemctl >/dev/null && [ -d /run/systemd/system ]; then
		systemctl enable --now docker >/dev/null 2>&1 || true
	fi

	docker info >/dev/null 2>&1 || fail "Docker is installed but not running. Start it (systemctl start docker) and run this script again."
	docker compose version >/dev/null 2>&1 || fail "Docker Compose is missing. Install the docker-compose-plugin package and run this script again."
}

# Whether the token can read the account: the token needs Account Settings (Read) anyway.
verify_credentials() {
	local response

	response="$(curl -sS --max-time 20 -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
		"$CLOUDFLARE_API/accounts/$CLOUDFLARE_ACCOUNT_ID" 2>/dev/null)" || return 1
	printf '%s' "$response" | grep -Eq '"success"[[:space:]]*:[[:space:]]*true'
}

ask_credentials() {
	local _

	step "Cloudflare"
	info "Pouchbase keeps its data on your Cloudflare account (D1 and R2). It needs the account ID and"
	info "an API token with these account permissions: Workers Scripts, D1, Workers R2 Storage and"
	info "Workers KV Storage (Edit), and Account Settings (Read)."
	info "Create one at https://dash.cloudflare.com/profile/api-tokens"
	printf '\n'

	CLOUDFLARE_ACCOUNT_ID="${CLOUDFLARE_ACCOUNT_ID:-}"
	CLOUDFLARE_API_TOKEN="${CLOUDFLARE_API_TOKEN:-}"

	# Answers from the environment are used as they are, without asking.
	local preset_id="$CLOUDFLARE_ACCOUNT_ID" preset_token="$CLOUDFLARE_API_TOKEN"

	for _ in 1 2 3; do
		if [ -z "$preset_id" ]; then
			ask CLOUDFLARE_ACCOUNT_ID "Cloudflare account ID" "$(env_value CLOUDFLARE_ACCOUNT_ID)"
		fi

		if [ -z "$preset_token" ]; then
			ask CLOUDFLARE_API_TOKEN "Cloudflare API token" "$(env_value CLOUDFLARE_API_TOKEN)" secret
		fi

		if ! [[ "$CLOUDFLARE_ACCOUNT_ID" =~ ^[0-9a-f]{32}$ ]]; then
			warn "The account ID should be 32 characters (0-9, a-f). Find it in the Cloudflare dashboard under Workers & Pages."
		elif [ -z "$CLOUDFLARE_API_TOKEN" ]; then
			warn "The API token is required."
		elif verify_credentials; then
			info "${GREEN}✓${RESET} The token has access to the account."
			return
		else
			warn "Cloudflare refused the token for this account. Check the account ID and that the token has Account Settings (Read)."
		fi

		if [ -n "$preset_id" ] && [ -n "$preset_token" ] || ! has_tty; then
			fail "Could not verify the Cloudflare credentials."
		fi

		# Ask again for whatever came from the previous run or the prompt.
		preset_id='' preset_token=''
	done

	fail "Could not verify the Cloudflare credentials."
}

# This server's public IPv4 address, as Cloudflare sees it; empty when it can't be found.
public_ip() {
	curl -fsS --max-time 10 https://cloudflare.com/cdn-cgi/trace 2>/dev/null | sed -n 's/^ip=//p' || true
}

ask_domain() {
	local previous ip resolved

	step "Domain"
	info "With a domain name, Caddy serves Pouchbase over HTTPS with a certificate from Let's Encrypt."
	info "Point an A record for it to this server first. Without a domain, Pouchbase only listens on"
	info "localhost and you reach it through an SSH tunnel: sign-in needs HTTPS on any other address."
	printf '\n'

	previous="$(env_value POUCHBASE_DOMAIN)"

	if [ -z "${POUCHBASE_DOMAIN:-}" ]; then
		ask POUCHBASE_DOMAIN "Domain name, e.g. pouchbase.example.com (empty for localhost only)" "$previous"
	fi

	# Lowercase and without a scheme or path, in case a URL was pasted.
	POUCHBASE_DOMAIN="$(printf '%s' "$POUCHBASE_DOMAIN" | tr '[:upper:]' '[:lower:]' | sed -e 's#^[a-z]*://##' -e 's#/.*$##')"

	if [ "$POUCHBASE_DOMAIN" = "none" ]; then
		POUCHBASE_DOMAIN=''
	fi

	if [ -z "$POUCHBASE_DOMAIN" ]; then
		POUCHBASE_PORT="${POUCHBASE_PORT:-$(env_value POUCHBASE_PORT)}"
		POUCHBASE_PORT="${POUCHBASE_PORT:-3000}"
		ORIGIN="http://localhost:$POUCHBASE_PORT"
		return
	fi

	[[ "$POUCHBASE_DOMAIN" =~ ^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$ ]] || fail "\"$POUCHBASE_DOMAIN\" is not a valid domain name."
	ORIGIN="https://$POUCHBASE_DOMAIN"

	# Only a warning: behind the Cloudflare proxy (orange cloud), the domain resolves to Cloudflare.
	ip="$(public_ip)"
	resolved="$({ getent ahostsv4 "$POUCHBASE_DOMAIN" || getent hosts "$POUCHBASE_DOMAIN"; } 2>/dev/null | awk 'NR == 1 { print $1 }' || true)"

	if [ -z "$resolved" ]; then
		warn "$POUCHBASE_DOMAIN does not resolve yet. Caddy keeps retrying the certificate until it does."
	elif [ -n "$ip" ] && [ "$resolved" != "$ip" ]; then
		warn "$POUCHBASE_DOMAIN resolves to $resolved, but this server is $ip. That's fine behind the Cloudflare proxy; otherwise update the A record."
	fi
}

open_firewall() {
	if command -v ufw >/dev/null && ufw status 2>/dev/null | grep -q '^Status: active'; then
		info "Opening ports 80 and 443 in ufw."
		ufw allow 80/tcp >/dev/null
		ufw allow 443/tcp >/dev/null
	fi
}

write_files() {
	step "Configuration"
	mkdir -p "$POUCHBASE_DIR"

	# The token is a secret: only root can read the file.
	(
		umask 077
		cat >"$POUCHBASE_DIR/.env" <<EOF
# Written by install.sh; run it again to change these, or edit them and run \`docker compose up -d\`.
# Every variable here is passed to the Pouchbase container.
CLOUDFLARE_ACCOUNT_ID=$CLOUDFLARE_ACCOUNT_ID
CLOUDFLARE_API_TOKEN=$CLOUDFLARE_API_TOKEN
ORIGIN=$ORIGIN
POUCHBASE_DOMAIN=$POUCHBASE_DOMAIN
POUCHBASE_PORT=${POUCHBASE_PORT:-}
BODY_SIZE_LIMIT=16M
EOF
	)
	chmod 600 "$POUCHBASE_DIR/.env"

	if [ -n "$POUCHBASE_DOMAIN" ]; then
		cat >"$POUCHBASE_DIR/docker-compose.yml" <<EOF
# Written by install.sh, which overwrites it on every run.
services:
  pouchbase:
    image: $IMAGE
    restart: unless-stopped
    env_file: .env

  caddy:
    image: caddy:2
    restart: unless-stopped
    depends_on:
      - pouchbase
    ports:
      - '80:80'
      - '443:443'
      - '443:443/udp'
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config

volumes:
  caddy_data:
  caddy_config:
EOF

		cat >"$POUCHBASE_DIR/Caddyfile" <<EOF
# Written by install.sh, which overwrites it on every run.
$POUCHBASE_DOMAIN {
	encode zstd gzip
	reverse_proxy pouchbase:3000
}
EOF
	else
		rm -f "$POUCHBASE_DIR/Caddyfile"

		cat >"$POUCHBASE_DIR/docker-compose.yml" <<EOF
# Written by install.sh, which overwrites it on every run.
services:
  pouchbase:
    image: $IMAGE
    restart: unless-stopped
    env_file: .env
    ports:
      # Localhost only: the session cookie needs HTTPS on any other address.
      - '127.0.0.1:$POUCHBASE_PORT:3000'
EOF
	fi

	info "Wrote $POUCHBASE_DIR/.env and $POUCHBASE_DIR/docker-compose.yml."
}

start() {
	local container status _

	step "Starting Pouchbase"
	cd "$POUCHBASE_DIR"
	# A failed pull is fine when the image is already here, e.g. while GitHub is unreachable.
	if ! docker compose pull --quiet; then
		docker image inspect "$IMAGE" >/dev/null 2>&1 || fail "Could not download $IMAGE."
		warn "Could not download $IMAGE; starting the version that is already on this server."
	fi

	docker compose up -d --remove-orphans

	# The image has a health check on /api/health.
	container="$(docker compose ps -q pouchbase)"

	for _ in $(seq 1 60); do
		status="$(docker inspect --format '{{.State.Health.Status}}' "$container" 2>/dev/null || true)"

		if [ "$status" = "healthy" ]; then
			info "${GREEN}✓${RESET} Pouchbase is running."
			return
		fi

		sleep 2
	done

	warn "Pouchbase did not report healthy within two minutes. Check the logs: cd $POUCHBASE_DIR && docker compose logs pouchbase"
}

summary() {
	local ip

	step "Done"

	if [ -n "$POUCHBASE_DOMAIN" ]; then
		info "Open ${BOLD}$ORIGIN${RESET} to create your admin account."
		info "The certificate can take a minute; Caddy requests it on the first visit."
	else
		ip="$(public_ip)"
		info "Pouchbase listens on localhost:$POUCHBASE_PORT. From your own computer, open a tunnel:"
		info ""
		info "  ssh -L $POUCHBASE_PORT:localhost:$POUCHBASE_PORT root@${ip:-<server>}"
		info ""
		info "Then open ${BOLD}$ORIGIN${RESET} to create your admin account."
	fi

	printf '\n'
	info "Files:   $POUCHBASE_DIR"
	info "Logs:    cd $POUCHBASE_DIR && docker compose logs -f pouchbase"
	info "Update:  run this script again, or: cd $POUCHBASE_DIR && docker compose pull && docker compose up -d"
}

main() {
	printf '%sPouchbase installer%s\n' "$BOLD" "$RESET"

	check_system
	install_docker
	ask_credentials
	ask_domain

	if [ -n "$POUCHBASE_DOMAIN" ]; then
		open_firewall
	fi

	write_files
	start
	summary
}

main "$@"
