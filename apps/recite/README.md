# Recite

A TV-first flashcard trainer. Select one or more decks, choose Review or Practice,
and train with the remote's arrows and Enter. Back returns to deck selection;
Back from deck selection returns to the kiosk. Card and deck management is not
part of the TV app.

## Run

From the repository root:

```sh
npm install
npm run dev --workspace @kiosk/recite
npm test --workspace @kiosk/recite
npm run build --workspace @kiosk/recite
```

The independent dev URL is `http://localhost:5178/apps/recite/`.
`npm run dev:all` also makes it available at
`http://localhost:5173/apps/recite/`. Production builds go to
`dist/apps/recite/` and are served by the root server.

## Deck Management

Open `/manage` on the kiosk server and select **Flashcard decks** to create,
rename, enable/disable, and delete decks, and add, edit, or delete their cards.
Deleting a deck also deletes its cards and requires confirmation. Unsaved edits
are protected when switching decks, cards, or management tabs.

The import control accepts a JSON export from the original Angular Recite app
or the format below. Import replaces the whole library after confirmation;
export downloads the saved library for backup. Browser-local review progress
is not included in exports.

Saved changes live at `data/recite/library.json` (or under `KIOSK_DATA_DIR`) and
survive builds. Runtime libraries and temporary save files are ignored by Git;
back them up separately or use the export control. A fresh checkout starts
with an empty library: create decks or import a backup through `/manage`.
Until the first save, the API can use an optional local
`apps/recite/public/data/library.json` seed file, which is also ignored by Git.
Run `npm run storage:migrate` with all kiosk/app servers stopped to align legacy
data paths. Compatibility links retain the old backing files for code rollback.
Both development and production use `/api/recite/library`; writes use the same
management-access protection as schedules. The independent Recite dev server
also serves this endpoint. Activate **Refresh library** in Recite (or reopen
the app) to load changes. An active training session is not interrupted.

Library format:

```json
{
  "decks": [
    { "id": "language", "name": "Vocabulary", "enabled": true }
  ],
  "flashcards": [
    {
      "id": "hello",
      "deckId": "language",
      "front": "Hello",
      "back": "Hallo"
    }
  ]
}
```

Keep IDs stable and unique. Each card must reference an existing deck and have
non-empty front/back text. Disabled decks are not offered on the TV. Plain text,
Unicode, and line breaks are supported; HTML is displayed as text, never executed.
Malformed libraries show a retry state rather than silently dropping cards.

Optional scheduling fields from Angular exports are accepted: `interval` (days),
`repetitions`, `easeFactor`, and `lastReviewDate` (ISO timestamp).

Libraries are limited to 5 MB. Invalid imports are rejected without changing
the saved library. Once a saved library exists, source/built sample-library
changes do not replace it; use the management import control instead.

## Training And Progress

- Review includes only due cards in the selected decks. Practice includes all
  cards and does not change review schedules.
- Sessions shuffle up to 20 cards. Again puts a card back once later in that
  session; a second miss leaves it for a future review.
- Again, Hard, Good, and Easy map to SuperMemo SM-2 grades 0, 3, 4, and 5 using
  the `supermemo` library. Missed cards remain due. This deliberately differs
  from the Angular app's custom interval multipliers.
- Deck selections and review progress are stored locally in the TV browser.
  Grades are saved immediately, including when leaving mid-session. Progress
  is not sent back to the external editor or shared with other browsers.
- Local progress overrides imported schedules only when the card ID, deck ID,
  front, and back still match. Changed content uses its imported schedule.
- Use the shared kiosk origin consistently; independent dev-server origins
  have separate browser storage. Clearing site data resets local progress.
- If browser storage cannot be written, a warning appears and training remains
  usable for the current visit.

The main screen is viewport-bounded. Large deck libraries scroll only inside
the deck chooser; card text fits into the available card area, with previous/next
text-page controls for long content instead of shrinking it below 24px. All training
controls remain outside that area and visible.