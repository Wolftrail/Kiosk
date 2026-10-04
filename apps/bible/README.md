# Bible

A daily, bilingual reading view for the kiosk. English uses the King James
Version with Apocrypha; Dutch uses the Statenvertaling with Apocrypha.
Texts are local JSON snapshots, not calls to an external Bible API.

## Current Scope

- The supplied Orthodox Bible Reading Plan PDF has been imported as 365 days,
  each with Old Testament, Psalms, Proverbs, and New Testament references.
- New Testament passages are readable in both languages with adjustable type,
  measured pagination, and a language toggle that keeps the current verse.
- The chosen start date determines today's plan day. Day selection also allows
  revisiting readings. Language, type size, start date, and passage completion
  are stored in this browser's local storage.
- Read-aloud uses the browser's Web Speech API and an installed voice matching
  the selected language. It reads the current passage from the current page,
  supports pause/resume/stop, highlights the spoken verse, and advances pages
  on speech boundary events when the voice provides them. Missing voices and
  playback failures are reported. Audio does not imply completion.

## Exact OSB Matching: Work Remaining

This is a reader foundation, **not yet a complete implementation of the OSB
daily plan**. The OSB Old Testament is based on the Septuagint. It differs from
KJV/SV in Psalm numbering, verse boundaries, Proverbs divisions, Jeremiah
ordering, and integrated Esther/Daniel additions, among other passages.

Until an independently verified passage crosswalk is added, all Old Testament,
Psalm, and Proverbs schedule entries retain their original PDF references but
are explicitly unavailable for reading, speech, or marking complete. No whole
chapter or approximate passage is substituted. New Testament entries use the
PDF's chapter/verse references in the selected edition. The original PDF also
contains apparent reference typos; do not silently correct its content without
checking the intended passage against an authoritative edition.

Imported source coverage has additional limits: KJV does not contain
3 Maccabees or Psalm 151. The Dutch file has an empty Psalm 151 section, which
is not usable scripture text. These gaps need explicit handling even after a
crosswalk exists. Imported Apocrypha are retained for that follow-up work.

## Provenance

The snapshots were imported from the local `rn-apps/Bible/sources/en-kjva.txt`
and `nl-svva.txt` files. That project's translation metadata describes the KJV
as public domain in most countries, with perpetual Crown copyright in the
United Kingdom, and the Statenvertaling as public domain. Verify the source
edition and applicable rights before redistribution; these snapshots are not
the copyrighted Orthodox Study Bible translation.

Only the supplied PDF's schedule references were extracted. The OSB Bible text
and PDF itself are not bundled.

## Development

From the repository root:

```powershell
npm run dev --workspace @kiosk/bible
npm test --workspace @kiosk/bible
npm run build --workspace @kiosk/bible
npm run lint
```

The app is available at `http://localhost:5176/apps/bible/` or on the kiosk's
shared origin when running `npm run dev:all`.

Regenerate the committed text and schedule snapshots with Node.js and Poppler's
`pdftotext` on PATH:

```powershell
node apps/bible/tools/import-data.mjs '<Bible sources directory>' '<reading-plan.pdf>'
```

The importer checks for Genesis 1:1 and all 365 four-part days. It normalizes
source whitespace and drops empty markers. Tests cover every schedule entry,
strict unverified-passage handling, calendar boundaries, and lossless long-verse
pagination. Source edition accuracy and the future Septuagint crosswalk still
require textual verification, not just structural tests.