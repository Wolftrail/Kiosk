#!/usr/bin/env bash
set -Eeuo pipefail

INSTALL_ROOT=${1:-/opt/kiosk}
PACKAGE_ROOT=${2:?Usage: install-auto-updates.sh INSTALL_ROOT EXTRACTED_RELEASE [SERVICE] [SERVICE_USER] [PORT]}
KIOSK_SERVICE=${3:-kiosk.service}
KIOSK_USER=${4:?Provide the Linux user that runs the Kiosk service.}
KIOSK_PORT=${5:-8080}
KIOSK_KEEP_RELEASES=${6:-5}

log() {
  printf '[kiosk-install] %s\n' "$*"
}

fail() {
  log "$*"
  exit 1
}

if (( EUID != 0 )); then fail 'Run this setup script with sudo.'; fi
for command_name in systemctl realpath install cp mv ln chown id curl jq sha256sum tar visudo; do
  command -v "$command_name" >/dev/null 2>&1 || fail "Required command not found: $command_name"
done

INSTALL_ROOT=$(realpath -m "$INSTALL_ROOT")
PACKAGE_ROOT=$(realpath -e "$PACKAGE_ROOT")
[[ "$INSTALL_ROOT" == /opt/kiosk ]] || fail 'This packaged updater is configured for /opt/kiosk.'
[[ -d "$INSTALL_ROOT" && -f "$INSTALL_ROOT/server.ts" ]] || fail "Existing flat installation not found at $INSTALL_ROOT."
[[ -f "$PACKAGE_ROOT/VERSION" && -f "$PACKAGE_ROOT/server.ts" && -f "$PACKAGE_ROOT/dist/index.html" ]] || fail 'The extracted release is incomplete.'
[[ -f "$PACKAGE_ROOT/scripts/kiosk-update.sh" && -f "$PACKAGE_ROOT/deploy/systemd/kiosk-update.service" ]] || fail 'The extracted release does not include updater assets.'
[[ ! -e "$INSTALL_ROOT/current" && ! -L "$INSTALL_ROOT/current" ]] || fail 'This installation already uses the releases/current layout.'
[[ ! -e "$INSTALL_ROOT/releases" && ! -e "$INSTALL_ROOT/shared" ]] || fail 'Unexpected releases or shared directory already exists; refusing migration.'
[[ ! -e /etc/kiosk-auto-update.conf && ! -e /etc/sudoers.d/kiosk-update ]] || fail 'Updater configuration already exists; review it before continuing.'
[[ ! -e /etc/systemd/system/kiosk-update.service && ! -e /etc/systemd/system/kiosk-update.timer ]] || fail 'Updater systemd units already exist; review them before continuing.'
[[ "$PACKAGE_ROOT/" != "$INSTALL_ROOT/"* ]] || fail 'Extract the new release outside /opt/kiosk before running setup.'
[[ "$KIOSK_SERVICE" =~ ^[A-Za-z0-9_.@-]+\.service$ ]] || fail 'Invalid systemd service name.'
[[ "$KIOSK_USER" =~ ^[A-Za-z_][A-Za-z0-9_.-]*$ ]] || fail 'Invalid system user name.'
[[ "$KIOSK_PORT" =~ ^[0-9]{1,5}$ ]] && (( KIOSK_PORT > 0 && KIOSK_PORT <= 65535 )) || fail 'Invalid Kiosk port.'
[[ "$KIOSK_KEEP_RELEASES" =~ ^[0-9]+$ ]] && (( KIOSK_KEEP_RELEASES >= 2 )) || fail 'Keep at least two releases.'
id "$KIOSK_USER" >/dev/null 2>&1 || fail "Service user does not exist: $KIOSK_USER"
systemctl cat "$KIOSK_SERVICE" >/dev/null 2>&1 || fail "Systemd service not found: $KIOSK_SERVICE"
service_user=$(systemctl show "$KIOSK_SERVICE" -p User --value)
[[ "$service_user" == "$KIOSK_USER" ]] || fail "Service runs as '${service_user:-root}', not '$KIOSK_USER'."

version=$(<"$PACKAGE_ROOT/VERSION")
[[ "$version" =~ ^v[0-9]+(\.[0-9]+){2}([.-][0-9A-Za-z.-]+)?$ ]] || fail "Invalid release version: $version"
[[ ! -e "/opt/kiosk/releases/$version" ]] || fail "Release already exists: $version"

service_was_active=0
if systemctl is-active --quiet "$KIOSK_SERVICE"; then service_was_active=1; fi
recover_on_failure() {
  local status=$?
  if (( status != 0 )); then
    if [[ -f "$INSTALL_ROOT/releases/legacy/server.ts" && ! -L "$INSTALL_ROOT/current" ]]; then
      ln -s releases/legacy "$INSTALL_ROOT/current" 2>/dev/null || true
      ln -s current/server.ts "$INSTALL_ROOT/server.ts" 2>/dev/null || true
      ln -s current/package.json "$INSTALL_ROOT/package.json" 2>/dev/null || true
    fi
    if (( service_was_active )); then systemctl start "$KIOSK_SERVICE" || true; fi
  fi
  return "$status"
}
trap recover_on_failure EXIT

systemctl stop "$KIOSK_SERVICE"
mkdir -p "$INSTALL_ROOT/releases/legacy" "$INSTALL_ROOT/shared"

move_state() {
  local relative_path=$1
  local source_path="$INSTALL_ROOT/$relative_path"
  local shared_path="$INSTALL_ROOT/shared/$relative_path"
  [[ ! -L "$source_path" ]] || fail "Unexpected symlink in existing data path: $source_path"
  [[ ! -e "$shared_path" ]] || fail "Shared data path already exists: $shared_path"
  mkdir -p "$(dirname "$shared_path")"
  if [[ -e "$source_path" ]]; then mv -- "$source_path" "$shared_path"; else mkdir -p "$shared_path"; fi
  chown "$KIOSK_USER:$(id -gn "$KIOSK_USER")" "$shared_path"
}

move_state data
move_state apps/jukebox/data
move_state apps/jukebox/public/videos

shopt -s dotglob nullglob
for entry in "$INSTALL_ROOT"/*; do
  name=${entry##*/}
  [[ "$name" == releases || "$name" == shared ]] && continue
  mv -- "$entry" "$INSTALL_ROOT/releases/legacy/"
done
shopt -u dotglob nullglob
printf 'legacy\n' > "$INSTALL_ROOT/releases/legacy/VERSION"

link_shared_path() {
  local release_root=$1
  local relative_path=$2
  local release_path="$release_root/$relative_path"
  local shared_path="$INSTALL_ROOT/shared/$relative_path"
  mkdir -p "$(dirname "$release_path")" "$(dirname "$shared_path")"
  [[ ! -e "$release_path" && ! -L "$release_path" ]] || fail "Unexpected release data path: $release_path"
  ln -s "$shared_path" "$release_path"
}

for release_root in "$INSTALL_ROOT/releases/legacy"; do
  link_shared_path "$release_root" data
  link_shared_path "$release_root" apps/jukebox/data
  link_shared_path "$release_root" apps/jukebox/public/videos
done

cp -a -- "$PACKAGE_ROOT" "/opt/kiosk/releases/$version"
for relative_path in data apps/jukebox/data apps/jukebox/public/videos; do
  link_shared_path "/opt/kiosk/releases/$version" "$relative_path"
done
service_group=$(id -gn "$KIOSK_USER")
chown -R --no-dereference "$KIOSK_USER:$service_group" "$INSTALL_ROOT/releases"
chown "$KIOSK_USER:$service_group" "$INSTALL_ROOT" "$INSTALL_ROOT/releases" "$INSTALL_ROOT/shared"
chown "$KIOSK_USER:$service_group" "$INSTALL_ROOT/shared/data" "$INSTALL_ROOT/shared/apps/jukebox/data" "$INSTALL_ROOT/shared/apps/jukebox/public/videos"
ln -s "releases/$version" "$INSTALL_ROOT/current"
ln -s current/server.ts "$INSTALL_ROOT/server.ts"
ln -s current/package.json "$INSTALL_ROOT/package.json"

health_check() {
  local attempt
  for attempt in {1..30}; do
    if curl --fail --silent --max-time 2 "http://127.0.0.1:$KIOSK_PORT/api/schedules" >/dev/null; then return 0; fi
    sleep 1
  done
  return 1
}

if ! systemctl start "$KIOSK_SERVICE" || ! health_check; then
  log 'New release failed its health check; restoring the previous installation.'
  ln -sfn releases/legacy "$INSTALL_ROOT/.current.rollback"
  mv -Tf "$INSTALL_ROOT/.current.rollback" "$INSTALL_ROOT/current"
  systemctl restart "$KIOSK_SERVICE" || true
  fail 'Kiosk did not start from the new release. The legacy release remains active.'
fi

install -m 0755 "$INSTALL_ROOT/current/scripts/kiosk-update.sh" "$INSTALL_ROOT/shared/kiosk-update.sh"
service_template="$INSTALL_ROOT/current/deploy/systemd/kiosk-update.service"
service_group=$(id -gn "$KIOSK_USER")
sed -e "s/@KIOSK_USER@/$KIOSK_USER/g" -e "s/@KIOSK_GROUP@/$service_group/g" "$service_template" > /etc/systemd/system/kiosk-update.service
install -m 0644 "$INSTALL_ROOT/current/deploy/systemd/kiosk-update.timer" /etc/systemd/system/kiosk-update.timer
sudoers_file=/etc/sudoers.d/kiosk-update
printf '%s ALL=(root) NOPASSWD: /usr/bin/systemctl restart %s\n' "$KIOSK_USER" "$KIOSK_SERVICE" > "$sudoers_file"
chmod 0440 "$sudoers_file"
visudo -cf "$sudoers_file"
printf 'KIOSK_ROOT=%s\nKIOSK_SERVICE=%s\nKIOSK_PORT=%s\nKIOSK_KEEP_RELEASES=%s\n' \
  "$INSTALL_ROOT" "$KIOSK_SERVICE" "$KIOSK_PORT" "$KIOSK_KEEP_RELEASES" > /etc/kiosk-auto-update.conf
chmod 0644 /etc/kiosk-auto-update.conf
systemctl daemon-reload
systemctl enable --now kiosk-update.timer
trap - EXIT
log "Installed $version, preserved the previous installation as releases/legacy, and enabled daily updates."