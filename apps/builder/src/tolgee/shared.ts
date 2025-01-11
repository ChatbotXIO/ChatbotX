import {
  DevTools,
  FormatSimple,
  Tolgee,
  type TolgeeStaticData,
} from "@tolgee/web"

const apiKey = process.env.NEXT_PUBLIC_TOLGEE_API_KEY
const apiUrl = process.env.NEXT_PUBLIC_TOLGEE_API_URL

export const ALL_LANGUAGES = ["en", "vi"]
export const DEFAULT_LANGUAGE = "en"

export async function getStaticData(
  languages: string[],
  namespaces: string[] = [""],
) {
  const result: TolgeeStaticData = {}
  for (const lang of languages) {
    for (const namespace of namespaces) {
      if (namespace) {
        result[`${lang}:${namespace}`] = (
          await import(`../i18n/${namespace}/${lang}.json`)
        ).default
      } else {
        result[lang] = (await import(`../i18n/${lang}.json`)).default
      }
    }
  }
  return result
}

export function TolgeeBase() {
  return (
    Tolgee()
      .use(FormatSimple())
      // replace with .use(FormatIcu()) for rendering plurals, foramatted numbers, etc.
      .use(DevTools())
      .updateDefaults({
        apiKey,
        apiUrl,
      })
  )
}
