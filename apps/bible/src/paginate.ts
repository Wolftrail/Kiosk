import type { Verse } from './reading.ts'

export type Fragment = Verse & { index: number }

export function paginate(verses: Verse[], fits: (fragments: Fragment[]) => boolean): Fragment[][] {
  const pages: Fragment[][] = []
  let page: Fragment[] = []
  for (const [index, verse] of verses.entries()) {
    const words = verse.text.split(/\s+/)
    let position = 0
    while (position < words.length) {
      let lower = 0
      let upper = words.length - position
      while (lower < upper) {
        const count = Math.ceil((lower + upper) / 2)
        const fragment = { ...verse, index, text: words.slice(position, position + count).join(' ') }
        if (fits([...page, fragment])) lower = count
        else upper = count - 1
      }
      if (lower === 0 && page.length) {
        pages.push(page)
        page = []
        continue
      }
      const count = Math.max(1, lower)
      page.push({ ...verse, index, text: words.slice(position, position + count).join(' ') })
      position += count
      if (position < words.length) {
        pages.push(page)
        page = []
      }
    }
  }
  if (page.length) pages.push(page)
  return pages
}