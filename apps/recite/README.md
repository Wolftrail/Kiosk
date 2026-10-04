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

## Externally Managed Library

The included two decks are sample content. Replace `public/data/library.json`
with the JSON export from the original Angular Recite application, or generate
the same format with another external editor:

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

In development, replace the source library and activate Refresh library on the
deck screen. For production, rebuild after changing the source library, or have
your external publishing process replace `dist/apps/recite/data/library.json`
atomically and then refresh the TV library. The next full build overwrites that
published copy, so retain the authoritative export outside `dist/` as well.
There is no upload endpoint, automatic sync, or Recite editor in `/manage`.

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