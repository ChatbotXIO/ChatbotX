import type { Locale as DateFnsLocale } from "date-fns"
import {
  ar,
  az,
  da,
  de,
  enUS,
  es,
  fi,
  fr,
  he,
  id,
  it,
  ja,
  nl,
  pt,
  ptBR,
  ro,
  sv,
  tr,
  vi,
  zhCN,
  zhTW,
} from "date-fns/locale"
import { type Locale, locales } from "@/i18n/config"

/** The date-fns locale of each app locale (calendar month/day names, `PP` dates). */
const DATE_FNS_LOCALES: Record<Locale, DateFnsLocale> = {
  ar,
  az,
  da,
  de,
  en: enUS,
  es,
  fi,
  fr,
  he,
  id,
  it,
  ja,
  nl,
  "pt-BR": ptBR,
  "pt-PT": pt,
  ro,
  sv,
  tr,
  vi,
  "zh-CN": zhCN,
  "zh-TW": zhTW,
}

const isAppLocale = (value: string): value is Locale =>
  (locales as readonly string[]).includes(value)

/** date-fns locale for a next-intl locale; English for anything unknown. */
export const toDateFnsLocale = (locale: string): DateFnsLocale =>
  isAppLocale(locale) ? DATE_FNS_LOCALES[locale] : enUS
