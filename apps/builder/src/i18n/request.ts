import { getRequestConfig } from "next-intl/server"
import type { Locale } from "@/i18n/config"
import { getUserLocale } from "@/lib/locale"
import ar from "../../messages/ar.json"
import en from "../../messages/en.json"
import vi from "../../messages/vi.json"

const messagesByLocale: Record<Locale, Record<string, unknown>> = {
  en,
  vi,
  ar,
}

function resolveEnglishFallback(key: string, namespace?: string) {
  const path = namespace ? `${namespace}.${key}` : key
  return path
    .split(".")
    .reduce<unknown>(
      (value, segment) =>
        typeof value === "object" && value !== null
          ? (value as Record<string, unknown>)[segment]
          : undefined,
      en,
    )
}

export default getRequestConfig(async () => {
  const locale = (await getUserLocale()) as Locale

  return {
    locale,
    messages: messagesByLocale[locale],
    getMessageFallback: ({ key, namespace }) => {
      const fallback = resolveEnglishFallback(key, namespace)
      if (typeof fallback === "string") {
        return fallback
      }
      return namespace ? `${namespace}.${key}` : key
    },
  }
})
