# Scripture

A daily, bilingual reading view for the kiosk. English uses the King James
Version with Apocrypha; Dutch uses the Statenvertaling with Apocrypha.
Texts and the schedule are local JSON snapshots, not external Bible API calls.

## Reading Plan

The app uses Catholic Gallery's published
[Catholic Bible in a Year](https://www.catholicgallery.org/catholic-bible-one-year-reading-plan/)
schedule: 365 days with two Old Testament readings, Psalms, and New Testament.
It includes Tobit, Judith, Wisdom, Sirach, Baruch, both Maccabees books, and the
Esther and Daniel additions. Catholic Gallery publishes CPDV references; the
reader displays KJV/SV text, not CPDV text.

- Esther's 15 CPDV chapters map to the main Esther text and separate additions,
  preserving their scheduled order.
- Daniel's prayer/song, Susanna, and Bel and the Dragon map to separate
  Apocrypha books. Daniel's chapter 3/4 boundary is adjusted.
- Dutch numbered Psalm titles and selected chapter endings are adjusted.
  The Dutch prayer/song combines two blessings numbered separately in English.
- The sidebar retains the plan's references. The reader shows the selected
  edition's references; combined-book readings identify the current book in
  the heading and book changes within the page.

Tests resolve every daily reading in both editions and confirm that every
non-placeholder verse imported for the Catholic canon is scheduled. These
structural checks do not establish authoritative textual accuracy or perfect
verse-by-verse equivalence between translations. Known numbering differences
have explicit mappings; other edition-specific differences may still require
textual verification. Empty and ellipsis-only source rows are not scripture.
Books outside the Catholic canon, such as Esdras and Prayer of Manasses, are
not part of this schedule.

The older OSB schedule remains on disk but is not used by the app. Completion
is keyed to the Catholic plan so old OSB flags cannot mark its readings read.

## Reader

The start date determines today's plan day; any day can also be selected.
Language, text size, start date, and completion are saved in browser storage.
The selected day, reading, and verse/word position are saved too. Reopening
resumes that position even on a later day; Today returns to today's first
reading. Without a saved position, the app opens today's first reading.
Page numbers may change with the window size or text size, so restoration
uses the saved verse and word offset rather than a fixed page number.
Read-aloud does not restart automatically after reopening.
Measured pagination keeps the reading and controls within the viewport.
Switching language retains the current verse where a corresponding location
is mapped; changing day or reading starts at the beginning.

Read-aloud uses the browser's Web Speech API and an installed voice matching
the selected language. It starts from the current page, supports pause,
resume, and stop, highlights the spoken verse, and follows speech boundaries
when the voice supplies them. Missing voices and playback failures are
reported. Listening does not automatically mark a reading complete.

## Provenance

The text snapshots were imported from the local
`rn-apps/Bible/sources/en-kjva.txt` and `nl-svva.txt` files. That project's
metadata describes KJV as public domain in most countries, with perpetual
Crown copyright in the United Kingdom, and Statenvertaling as public domain.
Verify the source edition and applicable rights before redistribution.
Neither the copyrighted Orthodox Study Bible translation nor its PDF is
bundled. Only schedule references, not Catholic Gallery Bible text or articles,
are imported from Catholic Gallery's monthly schedule pages.

## Development

From the repository root:

```powershell
npm run dev --workspace @kiosk/scripture
npm test --workspace @kiosk/scripture
npm run build --workspace @kiosk/scripture
npm run lint
```

The app is available at `http://localhost:5176/apps/scripture/`, or on the shared
kiosk origin when running `npm run dev:all`.

Regenerate the active schedule from Catholic Gallery's twelve monthly pages:

```powershell
node apps/scripture/tools/import-catholic-plan.mjs
```

The importer checks for all 365 four-part days and writes
`public/data/catholic-plan.json`. To regenerate Bible text snapshots and the
inactive historical OSB snapshot, use Node.js and Poppler's `pdftotext` on PATH:

```powershell
node apps/scripture/tools/import-data.mjs '<Bible sources directory>' '<reading-plan.pdf>'
```

Text import normalizes whitespace, drops empty markers, and checks Genesis
1:1. Tests also cover calendar boundaries and lossless long-verse pagination.