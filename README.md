# Kiosk

A React and TypeScript launcher for a workspace of focused, independently built apps.

## Tested platform

The current release of Linux Mint with the Xfce desktop environment is the development platform this product is tested on.

## Run locally

```sh
npm install
npm run dev:all
```

Open `http://localhost:5173/`. The kiosk proxies `/apps/jukebox/`, `/apps/workout/`, `/apps/scripture/`, and `/apps/recite/` to the app dev servers, so the browser stays on one origin. `npm run dev` starts only the kiosk; `npm run dev --workspace @kiosk/jukebox` starts an individual app.

`npm run build` builds the kiosk and all four apps into one `dist/` tree. `npm run lint` runs Oxlint across the workspace.

## Releases

Push a version tag on the commit to release, from any branch:

```sh
git tag v1.0.0
git push origin v1.0.0
```

The [release workflow](.github/workflows/release.yml) runs the root and workspace
tests, lint, and the full build on Linux with Node.js 22.18.0. After smoke-testing
the packaged server, it creates a GitHub Release with generated notes,
`kiosk.tar.gz`, and `SHA256SUMS`. Tags containing a hyphen, such as `v1.0.0-beta.1`,
are published as prereleases. Rerunning the workflow replaces the assets on the
existing release. Branch pushes alone do not publish releases.

Download both assets from the GitHub Release. On Linux, verify and extract them:

```sh
sha256sum -c SHA256SUMS
tar -xzf kiosk.tar.gz
cd kiosk
npm start
```

The archive includes the built kiosk, all apps, and the production server. No
`npm install` or build is needed. Install Node.js 22.18 or newer, plus yt-dlp and
FFmpeg for downloads, as described below. Local videos, library metadata,
schedules, credentials, and Node.js itself are not bundled. Extract updates into
a new directory and migrate `data/`, `apps/jukebox/data/`, and
`apps/jukebox/public/videos/` from the old installation while the server is stopped.

### Automatic updates on Linux Mint

The updater checks GitHub's latest stable release once per day. It downloads the
tagged release, verifies `SHA256SUMS`, stages it under `/opt/kiosk/releases/`,
then switches `/opt/kiosk/current` and restarts Kiosk. It keeps the active and
previous releases, retains up to five versions, and restores the previous
symlink if the restarted server fails its health check. Prereleases are not
installed automatically; an installation already on a prerelease remains pinned
until manually moved to a stable release. Older stable tags are never installed
over a newer version. A successful update briefly restarts the server and may
interrupt active playback.

This setup migrates the existing flat `/opt/kiosk` installation. It keeps
`kiosk.service` in place and expects it to run as the service user with its
working directory at `/opt/kiosk` and to start `/opt/kiosk/server.ts` or run
`npm start` there. The setup command below assumes the service user is `wolf`
and the port is `8080`; substitute your actual service user and port.

Install the updater's system dependencies and bootstrap from the latest
published stable release:

```sh
sudo apt update
sudo apt install curl jq
mkdir -p "$HOME/kiosk-update-bootstrap"
cd "$HOME/kiosk-update-bootstrap"
curl -fL https://github.com/Wolftrail/Kiosk/releases/latest/download/kiosk.tar.gz -o kiosk.tar.gz
curl -fL https://github.com/Wolftrail/Kiosk/releases/latest/download/SHA256SUMS -o SHA256SUMS
sha256sum -c SHA256SUMS
tar -xzf kiosk.tar.gz
sudo bash kiosk/scripts/install-auto-updates.sh /opt/kiosk "$PWD/kiosk" kiosk.service "$USER" 8080
```

The setup stops Kiosk while it moves the existing schedules, library metadata,
and videos into shared storage. It then starts the tagged release, verifies
`http://127.0.0.1:8080/api/schedules`, and enables `kiosk-update.timer`. The
daily updater runs as the Kiosk service user; a sudoers rule permits it to
restart only `kiosk.service`. Updates and rollbacks are logged by
`kiosk-update.service` in the system journal:

```sh
systemctl status kiosk-update.timer
sudo journalctl -u kiosk-update.service
```

The release workflow must publish a tag after updater support is added; older
published archives do not contain the updater scripts or version marker. The
existing manual release installation instructions remain available for other
platforms and custom layouts.

## Management And Production

The TV jukebox provides playback and tag filters only. Open `/manage` on the root kiosk server from a laptop or phone to queue YouTube links, view download status, create, rename, or delete tags, assign tags to videos, and delete selected videos with their stored media. There is no YouTube search. The shared on-screen keyboard remains available but is unused.

Click a video row to select just that video. Shift-click another row to select
the visible range between them. Clicking elsewhere in the page clears the row
selection; the Video tags panel stays active while you change tags.
Use **Select visible** to select all videos matching the current filters.
**Video tags** applies each tag change to
every selected video without changing its other tags. A mixed checkbox means
only some selected videos have that tag; checking it adds the tag to all of them.
Selections persist across filtering and library refreshes, including hidden
rows. Use **Clear selection** to deselect everything.

For production, use Node.js 22.18 or newer:

```sh
npm run build
npm start
```

Open `http://localhost:8080/` for the kiosk or `http://localhost:8080/manage` for management. `KIOSK_PORT` overrides the port. The server listens on all network interfaces and serves the built apps and live library API on one origin.

Without `KIOSK_ADMIN_PASSWORD`, management is available only from the server machine. To allow local-network management, set that environment variable before starting the server (or `npm run dev:all`). The browser prompts for HTTP Basic authentication; the username defaults to `admin` and can be changed with `KIOSK_ADMIN_USERNAME`. Enter credentials directly in the browser, never in a URL. From another device, open `http://<kiosk-lan-ip>:8080/manage` (port 5173 during development). Allow the chosen port through the host firewall only for your trusted local network. HTTP Basic authentication is not encrypted over HTTP; use a TLS reverse proxy on networks where traffic cannot be trusted. Do not expose the server to the internet.

Downloads run serially on the kiosk and continue when the management page closes. Job state is in memory and does not survive a server restart; downloaded files and tags do. The management page polls every three seconds; the TV refreshes its library every five seconds without interrupting its playing video. Completed downloads disappear from the manager. Failed downloads can be retried or removed with **Clear failed**, which only removes failed job records and does not delete videos or cancel queued or active downloads.

### Host on the LAN with Caddy

Use Caddy as a reverse proxy, not a static file server: the Node.js server is
required for management, schedules, and downloads. This example uses plain HTTP
at `http://kiosk.local/` on a trusted LAN only. Management passwords are not
encrypted over HTTP. Do not forward these ports from your internet router.

Install Caddy using its [Debian/Ubuntu installation instructions](https://caddyserver.com/docs/install#debian-ubuntu-raspbian).
Start Kiosk from the extracted release directory containing `package.json` and
`server.ts`, for example `/opt/kiosk`:

```sh
cd /opt/kiosk
export KIOSK_ADMIN_USERNAME=admin
read -rsp 'Management password: ' KIOSK_ADMIN_PASSWORD
echo
export KIOSK_ADMIN_PASSWORD
KIOSK_PORT=8080 npm start
```

Set a nonempty management password before exposing the proxy. Caddy connects
from loopback, so without this password Kiosk's local-only management check
does not protect against remote clients using Caddy. Keep the terminal open;
Caddy does not start the Kiosk process. For automatic startup, run Kiosk as a
separate systemd service with this working directory and a protected environment
file containing its settings.

Add this site block to `/etc/caddy/Caddyfile`, preserving any other sites:

```caddyfile
http://kiosk.local {
	reverse_proxy 127.0.0.1:8080
}
```

The explicit `http://` prevents Caddy from enabling automatic HTTPS for this
site. Format, validate, and apply the configuration:

```sh
sudo caddy fmt --overwrite /etc/caddy/Caddyfile
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl enable --now caddy
sudo systemctl reload caddy
```

For `.local` name resolution, the PC's hostname should be `kiosk` and Avahi
should be running. Change the hostname only if needed:

```sh
hostnamectl --static
sudo hostnamectl set-hostname kiosk
sudo apt install avahi-daemon
sudo systemctl enable --now avahi-daemon
```

Client devices must support mDNS and be on the same non-isolated LAN. If UFW is
enabled, allow port 80 from your actual LAN subnet, for example:

```sh
sudo ufw status
sudo ufw allow from 192.168.0.0/24 to any port 80 proto tcp
```

Keep direct LAN access to port 8080 blocked, removing any existing firewall
allow rules for it; the Node.js server listens on all interfaces. Caddy can
still reach it over loopback. Open `http://kiosk.local/` for the kiosk or
`http://kiosk.local/manage` for management.

To troubleshoot, first check `curl -I http://127.0.0.1:8080/` on the kiosk PC.
A connection failure means the Node.js server is not running on that port.
From Windows PowerShell, use `curl.exe` instead of the `curl` alias. For a kiosk
at `192.168.0.11`, this checks Caddy while bypassing hostname resolution:

```powershell
curl.exe -v --resolve kiosk.local:80:192.168.0.11 http://kiosk.local/
```

If that works but normal access does not, check name resolution. If the browser
upgrades to HTTPS, add a site-specific exception to its automatic HTTPS setting
and use the explicit HTTP URL. Cached redirects or site data can also interfere;
try a private window before clearing site data, which can reset app progress.

## App Schedules

Open **Management > Schedules** to add an app, local kiosk time, and weekdays.
Schedules can be enabled, edited, deleted, or tested in the management browser.
Definitions are stored on the server in `data/schedules.json`, so management from
a phone or laptop updates the kiosk too. The kiosk refreshes definitions every
30 seconds. Writes use the same access protection as the management screen.

When a reminder is due, the kiosk offers **No**, **Snooze 10 minutes**, and **Yes**.
No dismisses this occurrence only. Snoozes and handled occurrences survive page
navigation and browser restarts in that browser's local storage. Regular reminders
have a five-minute missed-time window; snoozed reminders can be picked up for up to
24 hours. Reminders detected while a scheduled app or another dialog is active are
persisted as pending, rather than expiring after five minutes. After the scheduled
app returns or the dialog closes, pending reminders appear one at a time. Each pending
reminder expires at the next local midnight after it was first detected; polling does
not extend its expiry. Explicit ten-minute snoozes can still cross midnight.
Disabling or deleting a schedule discards its pending reminders when the kiosk
receives the update. Reminders are not shown in Management
except through the test action. Keep one active kiosk tab to avoid duplicate prompts.
The browser must remain open and the computer awake; this does not wake the device.

Scheduled Workout launches skip the overview and begin with the five-second ready
countdown. Completion returns to the interrupted page after five seconds; Done and
confirmed early exit return immediately. Interrupted Jukebox playback restores its
track, queue, position, volume, and playing/paused state. If browser autoplay policy
blocks playback, use Play to resume. Scheduled Scripture starts today's daily plan
at its first section. Mark each section read and continue; confirming **Finish
reading and return** on the final section saves progress and notifies the scheduler
to resume the interrupted app. Back or the Kiosk link also returns without marking
unfinished reading complete. Read-aloud ending alone does not mark progress or return.
Manual Scripture visits keep their previous reading position and completion flow.
Other scheduled apps currently open normally; startup handling and completion
notification are independent optional hooks from `@kiosk/remote-ui`. The shared
scheduler owns return navigation and pauses further reminders during any scheduled visit.

Run `npm test` for the schedule API tests and `npm test --workspaces --if-present`
for app and shared-component regression tests.

## Jukebox Downloader Requirements

The Jukebox downloader runs in the production server or the Jukebox Vite server during development. Install both tools below on the kiosk machine, and make them callable from `PATH` before starting the server:

- [yt-dlp](https://github.com/yt-dlp/yt-dlp), invoked as `yt-dlp`.
- [FFmpeg](https://github.com/BtbN/FFmpeg-Builds/releases), invoked as `ffmpeg`, to merge separate video and audio streams, which is typical for higher resolutions. Download a build matching the server OS and architecture (for example, Linux x86_64 for most Mint PCs or Windows x86_64), then make its `ffmpeg` executable available on `PATH`.

Kiosk explicitly enables its running Node.js executable as yt-dlp's JavaScript runtime for YouTube challenge solving. Use Node.js 22.18 or newer and a current yt-dlp version. Official bundled yt-dlp executables include the EJS challenge scripts; Python installations should install or update `yt-dlp[default]`. Other installation methods may require additional EJS setup. See the [yt-dlp EJS guide](https://github.com/yt-dlp/yt-dlp/wiki/EJS). Missing runtime or solver support can cause signature warnings, missing formats, and access failures even with valid cookies.

A static build by itself cannot launch the downloader. Downloads are saved locally under `apps/jukebox/public/videos/` and listed in `apps/jukebox/data/library.json`.

Video downloads, merge intermediates, and thumbnail conversion files are staged in unique `kiosk-jukebox-*` directories under the system temporary directory, resolved by Node.js `os.tmpdir()` on Windows, macOS, and Linux. Only completed, nonempty files are published to `public/videos/`. If temp and videos are on different filesystems, completed files are copied to a short-lived staging directory under `apps/jukebox/public/.jukebox-staging/`, then renamed into place. Staging directories are removed after success or failure. A forced termination or power loss may leave staging files, but not partial downloads in the video directory. Automatic system temp cleanup varies by OS; leftover staging directories can be deleted while the server is stopped.

Downloads default to H.264/AAC for broad Linux playback compatibility, preferring the best match up to 1440p. If that codec pair is unavailable, the selector falls back to a pre-merged MP4 and then the best available format up to 1440p; actual resolution and codec depend on the source video.
YouTube URLs are normalized to a watch URL containing only the video ID (`?v=...`), dropping playlist, tracking, timestamp, and fragment parameters.

### Consistent music volume

New downloads use FFmpeg's two-pass EBU R128 loudness normalization with a target
of -16 LUFS, a -2 dBTP true-peak target, and an 11 LU loudness-range target.
This reduces volume differences between songs without re-encoding the video.
Audio is encoded as AAC at 192 kbps in an MP4 container. Songs retain musical
dynamics; this does not make every moment equally loud. Normalization adds
processing time, and a failure leaves the download unpublished.

To normalize songs already in the library, stop Kiosk, back up
`apps/jukebox/public/videos/` and `apps/jukebox/data/library.json`, then run from
the installation directory as the same OS user that runs Kiosk:

```sh
npm run jukebox:normalize
npm start
```

The command processes tracks serially without YouTube access, preserves tags
and thumbnails, and skips tracks already normalized by Kiosk. Each completed
file replaces its original only after processing succeeds; existing non-MP4
files are remuxed into MP4 and their library filenames updated. Failures are
reported with a nonzero exit status and can be retried by running the command
again. Ensure sufficient temporary disk space for one extra video at a time.
Restart Kiosk and reload its browser after processing. The player's volume
control still sets your preferred listening level.

On a TV, use the remote's arrow keys to move focus, Enter to activate a control, and Escape or Back to close an app setup dialog.

### Install on Linux Mint

For 64-bit Intel/AMD Linux Mint (`uname -m` reports `x86_64`), install the
official bundled yt-dlp executable in `/usr/local/bin/yt-dlp`. This makes it
available system-wide, including to the Kiosk server. ARM machines require a
different executable from the yt-dlp releases page.

```sh
sudo apt update
sudo apt install curl ca-certificates ffmpeg
curl -fL https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux \
	-o /tmp/yt-dlp
sudo install -m 755 /tmp/yt-dlp /usr/local/bin/yt-dlp
```

Verify the installation:

```sh
command -v yt-dlp
yt-dlp --version
ffmpeg -version
```

`command -v yt-dlp` should report `/usr/local/bin/yt-dlp`. Ensure that directory
is also in the server's `PATH` if you run Kiosk through systemd. Restart Kiosk
after installation.

Update the bundled yt-dlp executable later with:

```sh
sudo /usr/local/bin/yt-dlp -U
```

### Fix download permissions on Linux

An `EACCES: permission denied, rename` error when publishing a download to
`/opt/kiosk/apps/jukebox/public/videos/` can mean the destination directories
are owned by root after extracting the release with `sudo`. The Node.js server
user, not Caddy's user, needs write access to the videos, library metadata, and
publication staging directories.

Check which user runs Kiosk:

```sh
ps -eo user,args | grep '[n]ode.*server.ts'
```

Stop Kiosk before changing permissions. For a server running as `wolf` with the
release in `/opt/kiosk`, run the following. Replace the username and paths to
match your installation, including the systemd service user if applicable:

```sh
kiosk_user=wolf
for directory in /opt/kiosk/apps/jukebox/data \
	/opt/kiosk/apps/jukebox/public/videos \
	/opt/kiosk/apps/jukebox/public/.jukebox-staging; do
	sudo mkdir -p "$directory"
	sudo chown -R "$kiosk_user:$(id -gn "$kiosk_user")" "$directory"
	sudo chmod -R u+rwX "$directory"
done
```

Restart Kiosk and retry the failed download. Keep ownership changes limited to
these writable directories; do not run Kiosk as root or use `chmod 777`.

### Optional YouTube authentication

Public videos normally need no authentication. Videos that require a YouTube login need cookies from an account eligible to watch them. Kiosk management login does not authenticate YouTube. Set exactly one of these environment variables on the kiosk before starting or restarting `npm start` or `npm run dev:all`:

- `KIOSK_YTDLP_COOKIES_FILE`: absolute path to a private Netscape-format cookie file exported from a working YouTube session. This also works when the signed-in browser is on another device.
- `KIOSK_YTDLP_COOKIES_BROWSER`: yt-dlp browser specification, such as `firefox`, `chrome`, or `firefox:profile-path`. The signed-in browser profile must be on the kiosk and accessible to the OS user running the server. Browser cookie extraction and decryption support varies by platform and browser; a cookie file is an alternative when extraction fails.

PowerShell example using a private cookie file outside the repository:

```powershell
Remove-Item Env:KIOSK_YTDLP_COOKIES_BROWSER -ErrorAction SilentlyContinue
$env:KIOSK_YTDLP_COOKIES_FILE = "$env:USERPROFILE\kiosk-private\youtube-cookies.txt"
npm start
```

Linux/macOS example using a signed-in Firefox profile on the kiosk:

```sh
unset KIOSK_YTDLP_COOKIES_FILE
KIOSK_YTDLP_COOKIES_BROWSER=firefox npm start
```

#### Browser cookies on Windows and Linux

On Windows, Chrome cookie extraction can fail in two separate steps:

- `Could not copy Chrome cookie database`: the database may be locked by Chrome. Close all Chrome windows and background processes before retrying.
- `Failed to decrypt with DPAPI`: yt-dlp cannot decrypt the stored cookies. Modern Chrome app-bound encryption can cause this even after Chrome is closed. See [yt-dlp issue #10927](https://github.com/yt-dlp/yt-dlp/issues/10927). Enabling Node challenge solving does not fix local cookie decryption. Use Firefox browser cookies or an exported cookie file instead; do not disable Chrome's cookie security protections as a workaround.

To use a signed-in Firefox profile on Windows, stop the server, then start it from the same PowerShell session as these settings:

```powershell
Remove-Item Env:KIOSK_YTDLP_COOKIES_FILE -ErrorAction SilentlyContinue
$env:KIOSK_YTDLP_COOKIES_BROWSER = "firefox"
npm start
```

On Linux, including Linux Mint, yt-dlp supports browser-cookie extraction from Firefox, Chrome, and Chromium. The Windows DPAPI/app-bound encryption limitation does not apply. Run Kiosk as the same OS user who owns the signed-in browser profile. Chrome and Chromium extraction may also require access to the unlocked desktop keyring, which a background service or a session without a desktop login may lack. Firefox is a simpler starting point because its cookie extraction does not depend on Chrome's desktop-keyring setup.

To use a signed-in Chrome profile on Linux:

```sh
unset KIOSK_YTDLP_COOKIES_FILE
KIOSK_YTDLP_COOKIES_BROWSER=chrome npm start
```

Use `chromium` instead of `chrome` for Chromium. Browser support depends on the installed yt-dlp version, profile location, permissions, and keyring availability; it is not a guarantee that every installation will work. Linux browser-cookie extraction has not yet been verified on the target Mint installation. An exported cookie file remains an alternative when extraction fails.

All examples also apply to development by replacing `npm start` with `npm run dev:all`. Environment changes affect newly started processes only: restart the server after switching methods and set only one cookie variable.

Cookies are applied to metadata, video, and thumbnail requests. They are sensitive account credentials: never paste them into chat, commit them, or store them in the repository or any publicly served directory. Restrict cookie-file access to the server user. No cookie upload or YouTube password input is provided in management. Cookies can expire; refresh the file or sign in to the configured browser profile again, then retry. Authentication cannot grant access the account itself lacks.

See yt-dlp's [cookie FAQ](https://github.com/yt-dlp/yt-dlp/wiki/FAQ#how-do-i-pass-cookies-to-yt-dlp) and [YouTube cookie export guidance](https://github.com/yt-dlp/yt-dlp/wiki/Extractors#exporting-youtube-cookies) for export instructions and security considerations.

## Shared remote controls

Use `RemoteAppShell` from `@kiosk/remote-ui` for a full-viewport app frame with shared Kiosk branding, Back navigation, and remote focus handling. Set its title, category, description, and theme; put app-specific UI in its children. Import `@kiosk/remote-ui/styles.css` in the app entry point for the shared layout and viewport reset. For custom screens, `RemoteButton`, `RemoteLink`, and `RemoteNavigationProvider` are also available independently; the controls themselves remain unstyled.

The shared stylesheet also bundles the default Noto Sans UI font, Noto Serif
reading font, Thai fallback, and lightweight design tokens. Follow the
[Kiosk style guide](STYLEGUIDE.md) for typography, TV layouts, remote focus,
and the separate management-screen conventions.

## Add an app

Each app is an independent npm workspace under `apps/`. The kiosk catalog lives in `src/apps/registry.ts`; add the app's name, description, category, icon, project path, and launch URL there.

The app workspaces are Jukebox, Workout, Scripture, and Recite. Each builds to `dist/apps/<name>/` and is served under `/apps/<name>/` on the same origin as the kiosk. See `apps/README.md` for the project conventions.

Recite provides TV deck selection and flashcard training without card-management controls. Publish JSON exports from the original Recite application to its read-only library file. See [the Recite guide](apps/recite/README.md) for the format, publishing workflow, and browser-local progress behavior.

## Project layout

```text
src/                 Kiosk React application
src/apps/registry.ts App directory and launch URL registry
packages/remote-ui/  Shared controls and Bluetooth-remote navigation
apps/jukebox/        Jukebox React/TypeScript workspace
apps/workout/        Workout React/TypeScript workspace
apps/scripture/          Scripture React/TypeScript workspace
```
