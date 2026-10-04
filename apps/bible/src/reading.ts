export type Verse = { chapter: number; verse: number; text: string; book?: string; location?: string }
export type Bible = Record<string, Verse[]>
export type Reading = { reference: string; original: string; verses: Verse[]; note: string; book: string }
export type Language = 'en' | 'nl'

const aliases: Record<string, string> = {
  'First Samuel': 'I Samuel', 'Second Samuel': 'II Samuel', 'First Kings': 'I Kings', 'Second Kings': 'II Kings',
  'First Chronicles': 'I Chronicles', 'Second Chronicles': 'II Chronicles', 'First Maccabees': 'I Maccabees', 'Second Maccabees': 'II Maccabees',
  'First Corinthians': 'I Corinthians', 'Second Corinthians': 'II Corinthians', 'First Thessalonians': 'I Thessalonians',
  'Second Thessalonians': 'II Thessalonians', 'First Timothy': 'I Timothy', 'Second Timothy': 'II Timothy',
  'First Peter': 'I Peter', 'Second Peter': 'II Peter', 'First John': 'I John', 'Second John': 'II John', 'Third John': 'III John',
  Revelations: 'Revelation of John', 'Song of Songs': 'Song of Solomon', 'Wisdom of Solomon': 'Wisdom',
}

const dutchNames: Record<string, string> = {
  Exodus: 'Exodus', Leviticus: 'Leviticus', Numbers: 'Numeri', Deuteronomy: 'Deuteronomium', Joshua: 'Jozua', Judges: 'Richteren',
  'I Samuel': '1 Samuel', 'II Samuel': '2 Samuel', 'I Kings': '1 Koningen', 'II Kings': '2 Koningen',
  'I Chronicles': '1 Kronieken', 'II Chronicles': '2 Kronieken', Nehemiah: 'Nehemia', Job: 'Job', Psalms: 'Psalmen', Proverbs: 'Spreuken',
  Ecclesiastes: 'Prediker', 'Song of Solomon': 'Hooglied', Isaiah: 'Jesaja', Jeremiah: 'Jeremia', Lamentations: 'Klaagliederen',
  Ezekiel: 'Ezechiel', Hosea: 'Hosea', Joel: 'Joel', Amos: 'Amos', Obadiah: 'Obadja', Jonah: 'Jona', Micah: 'Micha', Nahum: 'Nahum',
  Zephaniah: 'Zefanja', Haggai: 'Haggai', Zechariah: 'Zacharia', Malachi: 'Maleachi', Matthew: 'Mattheus', Mark: 'Markus',
  Luke: 'Lukas', John: 'Johannes', Acts: 'Handelingen', Romans: 'Romeinen', 'I Corinthians': '1 Korinthe', 'II Corinthians': '2 Korinthe',
  Galatians: 'Galaten', Ephesians: 'Efeze', Philippians: 'Filippenzen', Colossians: 'Kolossenzen',
  'I Thessalonians': '1 Thessalonicenzen', 'II Thessalonians': '2 Thessalonicenzen', 'I Timothy': '1 Timotheus', 'II Timothy': '2 Timotheus',
  Titus: 'Titus', Philemon: 'Filemon', Hebrews: 'Hebreeen', James: 'Jakobus', 'I Peter': '1 Petrus', 'II Peter': '2 Petrus',
  'I John': '1 Johannes', 'II John': '2 Johannes', 'III John': '3 Johannes', 'Revelation of John': 'Openbaring',
  Wisdom: 'Wijsheid', Sirach: 'Jezus Sirach', 'I Esdras': '1 Esdras', 'I Maccabees': '1 Makkabeeen', 'II Maccabees': '2 Makkabeeen',
  'III Maccabees': '3 Makkabeeen', 'Prayer of Azariah': 'Gebed van Azaria', Susanna: 'Susanna', 'Bel and the Dragon': 'Bel en de draak',
  'Additions to Esther': 'Toevoegingen aan Esther', 'Esther (Greek)': 'Esther (Grieks)', 'Additional Psalm': 'Psalm 151',
}

export function bookName(book: string, language: Language) {
  return language === 'nl' ? dutchNames[book] ?? book : book.replace(/^III /, '3 ').replace(/^II /, '2 ').replace(/^I /, '1 ')
}

export function dayForDate(start: string, date = new Date()): number {
  const today = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
  const first = Date.parse(`${start}T00:00:00Z`)
  return Number.isFinite(first) ? Math.max(1, Math.min(365, Math.floor((today - first) / 86400000) + 1)) : 1
}

function selectRange(verses: Verse[], range: string): Verse[] {
  return range.split(';').flatMap((part) => {
    const match = part.trim().match(/^(\d+)(?::(\d+))?(?:-(\d+)(?::(\d+))?)?$/)
    if (!match) throw new Error(`Unsupported range: ${part}`)
    const chapter = Number(match[1])
    const firstVerse = Number(match[2] ?? 1)
    const endChapter = match[4] ? Number(match[3]) : match[2] ? chapter : Number(match[3] ?? chapter)
    const endVerse = match[4] ? Number(match[4]) : match[2] && match[3] ? Number(match[3]) : Infinity
    return verses.filter((verse) => (verse.chapter > chapter || verse.chapter === chapter && verse.verse >= firstVerse)
      && (verse.chapter < endChapter || verse.chapter === endChapter && verse.verse <= endVerse))
  })
}

type Part = { book: string; range: string }

const dutchPsalmTitles = new Set([3, 4, 5, 6, 7, 8, 9, 12, 18, 19, 20, 21, 22, 30, 31, 34, 36, 38, 39, 40, 41, 42, 44, 45, 46, 47, 48, 49, 53, 55, 56, 57, 58, 59, 61, 62, 63, 64, 65, 67, 68, 69, 70, 75, 76, 77, 80, 81, 83, 84, 85, 88, 89, 92, 102, 108, 140, 142])
const dutchDoublePsalmTitles = new Set([51, 52, 54, 60])
const dutchChapterEnds: Record<string, number> = {
  'I Maccabees:1': 64, 'I Maccabees:12': 53, 'I Maccabees:13': 53,
  'II Maccabees:2': 32, 'II Maccabees:12': 45, 'II Maccabees:15': 39,
  'Nehemiah:8': 18, 'John:1': 51,
}

function editionRange(part: Part, language: Language): string {
  if (language !== 'nl') return part.range
  if (part.book === 'Prayer of Azariah') {
    const match = part.range.match(/^1:(\d+)-(\d+)$/)
    if (match) return `1:${Number(match[1]) > 29 ? Number(match[1]) - 1 : match[1]}-${Number(match[2]) > 29 && match[2] !== '99' ? Number(match[2]) - 1 : match[2]}`
  }
  if (part.book === 'Psalms') {
    const match = part.range.match(/^(\d+):(\d+)-(\d+)(?::(\d+))?$/)
    if (match) {
      const chapter = Number(match[1])
      const endChapter = match[4] ? Number(match[3]) : chapter
      const offset = dutchDoublePsalmTitles.has(chapter) ? 2 : dutchPsalmTitles.has(chapter) ? 1 : 0
      const endOffset = dutchDoublePsalmTitles.has(endChapter) ? 2 : dutchPsalmTitles.has(endChapter) ? 1 : 0
      const endVerse = Number(match[4] ?? match[3]) + endOffset
      return `${chapter}:${Number(match[2]) === 1 ? 1 : Number(match[2]) + offset}-${match[4] ? `${endChapter}:` : ''}${endVerse}`
    }
  }
  const end = part.range.match(/^(\d+):(\d+)-(\d+)$/)
  if (end && dutchChapterEnds[`${part.book}:${end[1]}`] === Number(end[3])) return `${end[1]}:${end[2]}-99`
  const crossChapterEnd = part.range.match(/-(\d+):(\d+)$/)
  if (crossChapterEnd && dutchChapterEnds[`${part.book}:${crossChapterEnd[1]}`] === Number(crossChapterEnd[2])) return part.range.replace(/:\d+$/, ':99')
  return part.range
}

function verseLocation(book: string, verse: Verse, language: Language) {
  let number = verse.verse
  if (language === 'nl' && book === 'Psalms') number -= dutchDoublePsalmTitles.has(verse.chapter) ? 2 : dutchPsalmTitles.has(verse.chapter) ? 1 : 0
  if (language === 'nl' && book === 'Prayer of Azariah' && number >= 30) number += 1
  return `${book.replace('Esther (Greek)', 'Additions to Esther')}:${verse.chapter}:${number}`
}

function estherParts(range: string, bible: Bible): Part[] {
  const additions = bible['Esther (Greek)'] ? 'Esther (Greek)' : 'Additions to Esther'
  const chapters: Part[][] = [
    [], [{ book: additions, range: '11' }], [{ book: additions, range: '12' }],
    [{ book: 'Esther', range: '1' }], [{ book: 'Esther', range: '2' }], [{ book: 'Esther', range: '3' }],
    [{ book: additions, range: '13:1-7' }], [{ book: 'Esther', range: '4' }, { book: additions, range: '13:8-99' }],
    [{ book: additions, range: '14' }], [{ book: additions, range: '15' }, { book: 'Esther', range: '5' }],
    [{ book: 'Esther', range: '6' }], [{ book: 'Esther', range: '7' }], [{ book: 'Esther', range: '8' }],
    [{ book: additions, range: '16' }], [{ book: 'Esther', range: '9' }],
    [{ book: 'Esther', range: '10' }, { book: additions, range: '10:4-13' }],
  ]
  const [first, last = first] = range.split('-').map(Number)
  if (!chapters[first] || !chapters[last]) throw new Error(`Unsupported CPDV Esther range: ${range}`)
  return chapters.slice(first, last + 1).flat()
}

function danielParts(range: string): Part[] {
  if (range.startsWith('13:')) return [{ book: 'Susanna', range: range.replace(/^13:/, '1:') }]
  if (range.startsWith('14:')) return [{ book: 'Bel and the Dragon', range: range.replace(/^14:/, '1:') }]
  if (range === '3:24-30') return [{ book: 'Prayer of Azariah', range: '1:1-7' }]
  if (range === '3:31-55') return [{ book: 'Prayer of Azariah', range: '1:8-32' }]
  if (range === '3:56-76') return [{ book: 'Prayer of Azariah', range: '1:33-53' }]
  if (range === '3:77-100') return [{ book: 'Prayer of Azariah', range: '1:54-99' }, { book: 'Daniel', range: '3:24-30' }, { book: 'Daniel', range: '4:1-3' }]
  if (range === '4') return [{ book: 'Daniel', range: '4:4-99' }]
  return [{ book: 'Daniel', range }]
}

export function resolveReading(original: string, _section: number, bible: Bible, language: Language): Reading {
  const parts: Part[] = original.split(/,\s*(?=[A-Za-z])/).flatMap((reference) => {
    const match = reference.match(/^(.+?)\s+(\d.*)$/)
    if (!match) throw new Error(`Unsupported reference: ${reference}`)
    const book = aliases[match[1]] ?? match[1]
    const range = match[2].replaceAll('title', '1').replace(/\s+/g, '')
    if (book === 'Esther') return estherParts(range, bible)
    if (book === 'Daniel') return danielParts(range)
    return [{ book, range }]
  })
  const mapped = parts.map((part) => ({ ...part, range: editionRange(part, language) }))
  const verses = mapped.flatMap((part) => {
    if (!bible[part.book]) throw new Error(`Missing book: ${part.book}`)
    return selectRange(bible[part.book], part.range).filter((verse) => !/^[\s.\u2026]+$/.test(verse.text)).map((verse) => ({ ...verse, book: part.book, location: verseLocation(part.book, verse, language) }))
  })
  if (!verses.length) throw new Error(`Empty reading: ${original} (${language})`)
  return {
    book: parts[0].book, original, verses, note: '',
    reference: mapped.map((part) => {
      const endChapter = Number(part.range.match(/-(\d+):/)?.[1] ?? part.range.split(':')[0])
      const end = Math.max(...bible[part.book].filter((verse) => verse.chapter === endChapter).map((verse) => verse.verse))
      return `${bookName(part.book, language)} ${part.range.replace(/([:-])99/g, `$1${end}`)}`
    }).join('; '),
  }
}

export function planReference(reference: string, language: Language) {
  return reference.split(/,\s*(?=[A-Za-z])/).map((part) => {
    const match = part.match(/^(.+?)\s+(\d.*)$/)
    if (!match) return part
    return `${bookName(aliases[match[1]] ?? match[1], language)} ${match[2]}`
  }).join('; ')
}