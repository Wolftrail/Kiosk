export function pronunciationVoice<Voice extends { lang: string; default: boolean }>(voices: Voice[], language: string): Voice | undefined {
  const target = new Intl.Locale(language)
  const matching = voices.filter((voice) => {
    try {
      const locale = new Intl.Locale(voice.lang.replaceAll('_', '-'))
      return locale.language === target.language && locale.maximize().script === target.maximize().script
    } catch { return false }
  })
  return matching.find((voice) => voice.lang.toLowerCase() === language.toLowerCase())
    ?? matching.find((voice) => voice.default)
    ?? matching[0]
}