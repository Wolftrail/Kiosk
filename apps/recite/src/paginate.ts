export function paginateText(text: string, fits: (candidate: string) => boolean): string[] {
  const pages: string[] = []
  let remaining = text
  const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
  const words = new Intl.Segmenter(undefined, { granularity: 'word' })
  while (remaining) {
    if (fits(remaining)) { pages.push(remaining); break }
    const ends = Array.from(graphemes.segment(remaining), (part) => part.index + part.segment.length)
    let lower = 0
    let upper = ends.length
    while (lower < upper) {
      const middle = Math.ceil((lower + upper) / 2)
      if (fits(remaining.slice(0, ends[middle - 1]))) lower = middle
      else upper = middle - 1
    }
    let end = ends[Math.max(0, lower - 1)]
    const boundary = Array.from(words.segment(remaining.slice(0, end)), (part) => part.index)
      .filter((index) => index >= end * 0.75).pop()
    if (boundary) end = boundary
    pages.push(remaining.slice(0, end))
    remaining = remaining.slice(end)
  }
  return pages.length ? pages : ['']
}