#!/usr/bin/env bash
set -Eeuo pipefail

KIOSK_ROOT=${KIOSK_ROOT:-/opt/kiosk}
KIOSK_SERVICE=${KIOSK_SERVICE:-kiosk.service}
KIOSK_PORT=${KIOSK_PORT:-8080}
KIOSK_KEEP_RELEASES=${KIOSK_KEEP_RELEASES:-5}
RELEASES="$KIOSK_ROOT/releases"
CURRENT="$KIOSK_ROOT/current"
RELEASE_API='https://api.github.com/repos/Wolftrail/Kiosk/releases/latest'
RELEASE_DOWNLOAD='https://github.com/Wolftrail/Kiosk/releases/download'

log() {
  printf '[kiosk-update] %s\n' "$*"
}

for command_name in curl jq sha256sum tar sudo install find sort flock node; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    log "Required command not found: $command_name"
    exit 1
  fi
done

if [[ ! -L "$CURRENT" || ! -f "$CURRENT/VERSION" ]]; then
  log "Versioned installation not found at $CURRENT. Run install-auto-updates.sh first."
  exit 1
fi

exec 9>"$KIOSK_ROOT/.update.lock"
if ! flock -n 9; then
  log "Another updater is already running for $KIOSK_ROOT."
  exit 1
fi

current_version=$(<"$CURRENT/VERSION")
previous_target=$(readlink "$CURRENT")
if [[ "$current_version" == *-* ]]; then
  log "Installed prerelease $current_version is pinned; stable-channel updates are skipped."
  exit 0
fi

release_json=$(curl --fail --silent --show-error --location --retry 3 \
  --header 'Accept: application/vnd.github+json' \
  --header 'X-GitHub-Api-Version: 2022-11-28' \
  --user-agent 'Kiosk-Updater' "$RELEASE_API")
latest_version=$(jq --exit-status --raw-output '.tag_name | select(type == "string")' <<< "$release_json")

if [[ ! "$latest_version" =~ ^v[0-9]+(\.[0-9]+){2}([.-][0-9A-Za-z.-]+)?$ ]]; then
  log "GitHub returned an invalid release tag: $latest_version"
  exit 1
fi

if [[ "$latest_version" == "$current_version" ]]; then
  log "Already up to date at $current_version."
  exit 0
fi
newest_version=$(printf '%s\n%s\n' "$current_version" "$latest_version" | sort -V | tail -n 1)
if [[ "$newest_version" != "$latest_version" ]]; then
  log "Latest stable release $latest_version is older than $current_version; skipping downgrade."
  exit 0
fi

download_dir=$(mktemp -d)
staging_dir=''
service_stopped=0
activation_attempted=0
update_succeeded=0
cleanup() {
  rm -rf -- "$download_dir"
  if [[ -n "$staging_dir" ]]; then rm -rf -- "$staging_dir"; fi
}
rollback_on_failure() {
  local status=$?
  trap - EXIT
  if (( status != 0 && service_stopped && ! update_succeeded )); then
    log "Update failed; restoring $current_version and restarting Kiosk."
    if (( activation_attempted )); then atomic_switch "$previous_target" || log 'Could not restore the previous current symlink.'; fi
    if ! sudo -n /usr/bin/systemctl restart "$KIOSK_SERVICE"; then
      log 'Rollback restart failed.'
    elif ! schedule_health_check; then
      log 'Previous release did not pass its schedule health check.'
    fi
  fi
  cleanup
  return "$status"
}
trap rollback_on_failure EXIT

archive_url="$RELEASE_DOWNLOAD/$latest_version/kiosk.tar.gz"
curl --fail --silent --show-error --location --retry 3 "$archive_url" -o "$download_dir/kiosk.tar.gz"
curl --fail --silent --show-error --location --retry 3 "$RELEASE_DOWNLOAD/$latest_version/SHA256SUMS" -o "$download_dir/SHA256SUMS"
if ! grep -Eq '^[[:xdigit:]]{64}  kiosk\.tar\.gz$' "$download_dir/SHA256SUMS" \
  || ! (cd "$download_dir" && sha256sum --check --status SHA256SUMS); then
  log "Release archive checksum verification failed."
  exit 1
fi

if ! tar -tzf "$download_dir/kiosk.tar.gz" | awk '
  /^\// || $0 !~ /^kiosk(\/|$)/ || $0 ~ /(^|\/)\.\.(\/|$)/ { invalid = 1 }
  END { exit invalid || NR == 0 }
'; then
  log "Release archive contains an unexpected path."
  exit 1
fi

mkdir -p "$RELEASES"
staging_dir=$(mktemp -d "$RELEASES/.staging.XXXXXX")
target_release="$RELEASES/$latest_version"
if [[ -e "$target_release" || -L "$target_release" ]]; then
  if [[ ! -d "$target_release" || ! -f "$target_release/VERSION" || $(<"$target_release/VERSION") != "$latest_version" ]]; then
    log "A conflicting release directory already exists: $target_release"
    exit 1
  fi
else
  tar --extract --gzip --file "$download_dir/kiosk.tar.gz" --directory "$staging_dir" --no-same-owner
  if [[ ! -f "$staging_dir/kiosk/VERSION" || $(<"$staging_dir/kiosk/VERSION") != "$latest_version" ]]; then
    log "Release archive version does not match its tag."
    exit 1
  fi
  mv -- "$staging_dir/kiosk" "$target_release"
fi

link_shared_path() {
  local release_root=$1
  local relative_path=$2
  local release_path="$release_root/$relative_path"
  local shared_path="$KIOSK_ROOT/shared/$relative_path"
  mkdir -p "$(dirname "$release_path")" "$(dirname "$shared_path")"
  if [[ -L "$release_path" && $(readlink "$release_path") == "$shared_path" ]]; then return; fi
  if [[ -e "$release_path" || -L "$release_path" ]]; then
    log "Refusing to replace existing release data path: $release_path"
    return 1
  fi
  mkdir -p "$shared_path"
  ln -s "$shared_path" "$release_path"
}

link_shared_path "$target_release" data
link_shared_path "$target_release" apps/jukebox/data
link_shared_path "$target_release" apps/jukebox/public/videos

atomic_switch() {
  local target=$1
  local temporary_link="$KIOSK_ROOT/.current.$$.new"
  ln -s "$target" "$temporary_link"
  mv -Tf -- "$temporary_link" "$CURRENT"
}

health_check() {
  local attempt
  for attempt in {1..30}; do
    if curl --fail --silent --max-time 2 "http://127.0.0.1:$KIOSK_PORT/api/schedules" >/dev/null \
      && curl --fail --silent --max-time 2 "http://127.0.0.1:$KIOSK_PORT/api/recite/library" >/dev/null \
      && curl --fail --silent --max-time 2 "http://127.0.0.1:$KIOSK_PORT/api/health" >/dev/null; then return 0; fi
    sleep 1
  done
  return 1
}

schedule_health_check() {
  local attempt
  for attempt in {1..30}; do
    if curl --fail --silent --max-time 2 "http://127.0.0.1:$KIOSK_PORT/api/schedules" >/dev/null; then return 0; fi
    sleep 1
  done
  return 1
}

log "Activating $latest_version (currently $current_version)."
for service_action in stop start restart; do
  if ! sudo -n -l /usr/bin/systemctl "$service_action" "$KIOSK_SERVICE" >/dev/null 2>&1; then
    log "Updater cannot run systemctl $service_action $KIOSK_SERVICE without a password."
    log "Ask an administrator to update /etc/sudoers.d/kiosk-update to allow exact stop, start, and restart commands, then retry."
    exit 1
  fi
done

service_stopped=1
sudo -n /usr/bin/systemctl stop "$KIOSK_SERVICE"
KIOSK_DATA_DIR="$KIOSK_ROOT/shared/data" KIOSK_LEGACY_ROOT="$KIOSK_ROOT/shared" \
  node --experimental-strip-types "$target_release/scripts/migrate-storage.ts"
KIOSK_DATA_DIR="$KIOSK_ROOT/shared/data" KIOSK_LEGACY_ROOT="$KIOSK_ROOT/shared" \
  node --experimental-strip-types "$target_release/scripts/migrate-storage.ts" --check

activation_attempted=1
atomic_switch "releases/$latest_version"
sudo -n /usr/bin/systemctl start "$KIOSK_SERVICE"
health_check || { log 'New release failed the schedule, Recite, or Jukebox health check.'; exit 1; }

if [[ -f "$target_release/scripts/kiosk-update.sh" ]]; then
  install -m 0755 "$target_release/scripts/kiosk-update.sh" "$KIOSK_ROOT/shared/kiosk-update.sh.new"
  mv -f -- "$KIOSK_ROOT/shared/kiosk-update.sh.new" "$KIOSK_ROOT/shared/kiosk-update.sh"
fi

active_release=${target_release##*/}
previous_release=${previous_target##*/}
mapfile -t installed_releases < <(find "$RELEASES" -mindepth 1 -maxdepth 1 -type d ! -name '.staging.*' -printf '%f\n' | sort -V)
remaining=${#installed_releases[@]}
for release_name in "${installed_releases[@]}"; do
  if (( remaining <= KIOSK_KEEP_RELEASES )); then break; fi
  if [[ "$release_name" == "$active_release" || "$release_name" == "$previous_release" ]]; then continue; fi
  rm -rf -- "$RELEASES/$release_name"
  remaining=$((remaining - 1))
done

log "Successfully installed $latest_version. Previous release retained: $previous_release."
update_succeeded=1