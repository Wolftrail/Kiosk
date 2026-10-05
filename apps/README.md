# App Projects

Each subdirectory is an independent React/TypeScript npm workspace with its own entry point and Vite config. Keep app-specific source and assets inside that app; keep the kiosk shell in the repository root.

Use `RemoteAppShell` from `@kiosk/remote-ui` for the shared full-screen frame, Kiosk branding, Back link, and remote navigation. Import `@kiosk/remote-ui/styles.css` in `src/main.tsx`. The shell accepts app-specific title, category, description, and theme props; keep app content in its children. For custom layouts, the unstyled `RemoteButton`, `RemoteLink`, and `RemoteNavigationProvider` exports are available separately.

The kiosk catalog contains `jukebox`, `workout`, `scripture`, and `recite`.

Use `src/assets/` for imported assets and `public/` for files that need stable paths. The kiosk Vite server proxies app paths to the matching workspace dev server. Run the kiosk and all apps with `npm run dev:all`, or an individual app with `npm run dev --workspace @kiosk/<name>`.

Each app builds into the root `dist/apps/<name>/` directory with its base path set to `/apps/<name>/`. Keep that base path and the matching URL in `src/apps/registry.ts` aligned when adding an app.

## Jukebox Thumbnails

The jukebox requires `yt-dlp` and `ffmpeg` on PATH for downloads. New downloads save YouTube artwork as a local JPEG alongside the video in `apps/jukebox/public/videos/`, using `<video-id>.thumb.jpg`. If artwork cannot be saved, FFmpeg extracts a representative frame instead. Thumbnail failures do not prevent a video from being added to the library.

When the library is loaded, existing videos without thumbnails are backfilled from their local video files without accessing YouTube. The thumbnail filename is saved in `apps/jukebox/data/library.json`; the API supplies a local `thumbnailUrl` for library artwork and player posters. Failed thumbnail attempts are retried after restarting the jukebox server.

## Jukebox Tags

The root kiosk management page at `/manage` separates video tag assignment from tag catalog management. Select a video and use its tag checkboxes to assign existing tags. The catalog supports tag creation, renaming, usage counts, and confirmed deletion. Creating a tag never assigns it to the selected video; renaming updates all assignments. Confirmed tag deletion removes the tag from the catalog and all video assignments. Select one or more videos and confirm deletion to remove their library entries and stored media. The TV jukebox uses a read-only library refresh and contains only playback and tag filters.
