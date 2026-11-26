import type { Locale } from "@chatbotx.io/utils/ui-locale"

export {
  defaultLocale,
  isLocale,
  type Locale,
  locales,
  resolveLocale,
} from "@chatbotx.io/utils/ui-locale"

export const localeMeta: Record<
  Locale,
  { nativeLabel: string; dir: "ltr" | "rtl" }
> = {
  ar: { nativeLabel: "العربية", dir: "rtl" },
  az: { nativeLabel: "Azərbaycanca", dir: "ltr" },
  da: { nativeLabel: "Dansk", dir: "ltr" },
  de: { nativeLabel: "Deutsch", dir: "ltr" },
  en: { nativeLabel: "English", dir: "ltr" },
  es: { nativeLabel: "Español", dir: "ltr" },
  fi: { nativeLabel: "Suomi", dir: "ltr" },
  fr: { nativeLabel: "Français", dir: "ltr" },
  he: { nativeLabel: "עברית", dir: "rtl" },
  id: { nativeLabel: "Bahasa Indonesia", dir: "ltr" },
  it: { nativeLabel: "Italiano", dir: "ltr" },
  ja: { nativeLabel: "日本語", dir: "ltr" },
  nl: { nativeLabel: "Nederlands", dir: "ltr" },
  "pt-BR": { nativeLabel: "Português (Brasil)", dir: "ltr" },
  "pt-PT": { nativeLabel: "Português (Portugal)", dir: "ltr" },
  ro: { nativeLabel: "Română", dir: "ltr" },
  sv: { nativeLabel: "Svenska", dir: "ltr" },
  tr: { nativeLabel: "Türkçe", dir: "ltr" },
  vi: { nativeLabel: "Tiếng Việt", dir: "ltr" },
  "zh-CN": { nativeLabel: "简体中文", dir: "ltr" },
  "zh-TW": { nativeLabel: "繁體中文", dir: "ltr" },
}
