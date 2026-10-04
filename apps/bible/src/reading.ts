export type Verse = { chapter: number; verse: number; text: string }
export type Bible = Record<string, Verse[]>
export type Reading = { reference: string; original: string; verses: Verse[]; note: string; book: string }
export type Language = 'en' | 'nl'

const books: Record<string, string> = {
  Gn: 'Genesis', Ex: 'Exodus', Lv: 'Leviticus', Nm: 'Numbers', Dt: 'Deuteronomy', Jos: 'Joshua', Jdg: 'Judges', Ru: 'Ruth',
  '1Kg': 'I Samuel', '2Kg': 'II Samuel', '3Kg': 'I Kings', '4Kg': 'II Kings', '1Ch': 'I Chronicles', '2Ch': 'II Chronicles',
  '1Ez': 'I Esdras', '2Ez': 'Ezra', Neh: 'Nehemiah', Tb: 'Tobit', Jdt: 'Judith', Est: 'Esther',
  '1Mc': 'I Maccabees', '2Mc': 'II Maccabees', '3Mc': 'III Maccabees', Job: 'Job', Ecc: 'Ecclesiastes', SS: 'Song of Solomon',
  WSol: 'Wisdom', WSir: 'Sirach', Hos: 'Hosea', Am: 'Amos', Mic: 'Micah', Joel: 'Joel', Ob: 'Obadiah', Jon: 'Jonah', Nah: 'Nahum',
  Hab: 'Habakkuk', Zep: 'Zephaniah', Hag: 'Haggai', Zec: 'Zechariah', Mal: 'Malachi', Is: 'Isaiah', Jer: 'Jeremiah',
  Bar: 'Baruch', EJer: 'Baruch', Lam: 'Lamentations', Ezk: 'Ezekiel', Dan: 'Daniel',
  Mt: 'Matthew', Mk: 'Mark', Lk: 'Luke', Jn: 'John', Ac: 'Acts', Rom: 'Romans', '1Co': 'I Corinthians', '2Co': 'II Corinthians',
  Gal: 'Galatians', Eph: 'Ephesians', Php: 'Philippians', Col: 'Colossians', '1Th': 'I Thessalonians', '2Th': 'II Thessalonians',
  '1Ti': 'I Timothy', '2Ti': 'II Timothy', Tts: 'Titus', Phm: 'Philemon', Heb: 'Hebrews', Jas: 'James',
  '1Pt': 'I Peter', '2Pt': 'II Peter', '1Jn': 'I John', '2Jn': 'II John', '3Jn': 'III John', Jude: 'Jude', Rev: 'Revelation of John',
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

export function resolveReading(original: string, section: number, bible: Bible, language: Language): Reading {
  const normalized = original.replace(/^([1-4]?[A-Za-z]+)(?=\d)/, '$1 ')
  const book = section === 1 ? 'Psalms' : section === 2 ? 'Proverbs' : books[normalized.split(' ')[0]]
  let range = section === 1 || section === 2 ? original : normalized.slice(normalized.indexOf(' ') + 1)
  if (!book) throw new Error(`Unknown book: ${original}`)
  range = range.replace('4:4:24', '4:24').replace('134:1-1-12', '134:1-12').replace(/\s/g, '')
  if (!normalized.includes(' ')) range = '1'
  if (section !== 3) {
    return {
      book, original, reference: section === 1 ? `${bookName(book, language)} ${original}` : section === 2 ? `${bookName(book, language)} ${original}` : `${bookName(book, language)} ${range}`,
      verses: [],
      note: language === 'nl'
        ? 'Deze OSB-lezing gebruikt Septuaginta-nummering. De exacte koppeling met deze vertaling is nog niet geverifieerd.'
        : 'This OSB reading uses Septuagint numbering. Its exact correspondence with this translation has not yet been verified.',
    }
  }
  const verses = selectRange(bible[book] ?? [], range)
  const note = verses.length ? '' : language === 'nl' ? 'Deze lezing ontbreekt in deze uitgave.' : 'This reading is not in this edition.'
  return { book, original, reference: `${bookName(book, language)} ${range}`, verses, note }
}