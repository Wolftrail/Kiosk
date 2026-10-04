export type KeyboardLanguage = 'en' | 'th'

export const keyboardLayouts: Record<KeyboardLanguage, { normal: string; shifted: string }[]> = {
  en: [
    { normal: '1234567890-=', shifted: '!@#$%^&*()_+' },
    { normal: 'qwertyuiop[]\\', shifted: 'QWERTYUIOP{}|' },
    { normal: "asdfghjkl;'", shifted: 'ASDFGHJKL:"' },
    { normal: 'zxcvbnm,./', shifted: 'ZXCVBNM<>?' },
  ],
  th: [
    { normal: 'ๅ/-ภถุึคตจขช', shifted: '+๑๒๓๔ู฿๕๖๗๘๙' },
    { normal: 'ๆไำพะัีรนยบลฃ', shifted: '๐"ฎฑธํ๊ณฯญฐ,ฅ' },
    { normal: 'ฟหกดเ้่าสวง', shifted: 'ฤฆฏโฌ็๋ษศซ.' },
    { normal: 'ผปแอิืทมใฝ', shifted: '()ฉฮฺ์?ฒฬฦ' },
  ],
}

export type KeyboardEdit = { value: string; caret: number }

export function insertKeyboardText(value: string, text: string, start = value.length, end = start, maxLength?: number): KeyboardEdit {
  const nextValue = `${value.slice(0, start)}${text}${value.slice(end)}`
  if (maxLength !== undefined && nextValue.length > maxLength) return { value, caret: start }
  return { value: nextValue, caret: start + text.length }
}

const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' })

export function deleteKeyboardText(value: string, start = value.length, end = start): KeyboardEdit {
  if (start !== end) return { value: value.slice(0, start) + value.slice(end), caret: start }
  if (start === 0) return { value, caret: 0 }
  let previousStart = 0
  for (const segment of graphemes.segment(value.slice(0, start))) previousStart = segment.index
  return { value: value.slice(0, previousStart) + value.slice(end), caret: previousStart }
}