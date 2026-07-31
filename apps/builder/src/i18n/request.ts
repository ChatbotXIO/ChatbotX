import { getRequestConfig } from "next-intl/server"
import { resolveLocale } from "@/i18n/config"
import { messagesByLocale } from "@/i18n/messages"
import { getUserLocale } from "@/lib/locale"

function resolveEnglishFallback(key: string, namespace?: string) {
  const path = namespace ? `${namespace}.${key}` : key
  return path
    .split(".")
    .reduce<unknown>(
      (value, segment) =>
        typeof value === "object" && value !== null
          ? (value as Record<string, unknown>)[segment]
          : undefined,
      messagesByLocale.en,
    )
}

export default getRequestConfig(async () => {
  const locale = resolveLocale(await getUserLocale())

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
