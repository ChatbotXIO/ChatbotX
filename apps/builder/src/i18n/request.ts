import { getRequestConfig } from "next-intl/server"
import { resolveLocale } from "@/i18n/config"
import { messagesByLocale } from "@/i18n/messages"
import { getUserLocale } from "@/lib/locale"
import { getUserTimezone } from "@/lib/timezone"

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
  // Without an explicit zone next-intl inherits the server process zone and
  // hands it to the client, so a UTC server formats every date in UTC.
  const timeZone = await getUserTimezone()

  return {
    locale,
    timeZone,
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
