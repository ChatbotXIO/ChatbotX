import { resolveLocale } from "@/i18n/config"
import { messagesByLocale } from "@/i18n/messages"

export function loadWorkspaceMessages(language: string) {
  const locale = resolveLocale(language)
  return Promise.resolve({ locale, messages: messagesByLocale[locale] })
}
