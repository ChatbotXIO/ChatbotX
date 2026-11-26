"use client"

import { isSameLanguage } from "@chatbotx.io/business/translation/language-policy"
import { Badge } from "@chatbotx.io/ui/components/ui/badge"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@chatbotx.io/ui/components/ui/tooltip"
import { useLocale, useTranslations } from "next-intl"
import { useTranslationSettings } from "../hooks/use-translation-settings"
import { readConversationTranslation } from "../lib/conversation-translation"
import { languageBadge, languageLabel } from "../lib/language-label"

/**
 * A small code (`ES`) on a conversation row for the customer's language, shown
 * only when translation is on and the language differs from the workspace's. It
 * reads what is already in the store (no request), and the settings query it
 * shares with the rest of the Inbox.
 */
export function ConversationLanguageBadge(props: {
  conversation: { additionalAttributes?: unknown }
}) {
  const t = useTranslations("inboxTranslation.badge")
  const locale = useLocale()
  const { data: settings } = useTranslationSettings()
  const { language, enabledOverride } = readConversationTranslation(
    props.conversation,
  )

  if (
    !settings?.enabled ||
    enabledOverride === false ||
    !language ||
    isSameLanguage(language, settings.workspaceLanguage)
  ) {
    return null
  }

  const badge = (
    <Badge
      className="shrink-0 rounded px-1.5 py-0 font-medium text-[10px] leading-4"
      variant="outline"
    >
      {languageBadge(language)}
    </Badge>
  )
  return (
    <Tooltip>
      <TooltipTrigger render={badge} />
      <TooltipContent align="center" side="top">
        {t("tooltip", { language: languageLabel(language, locale) })}
      </TooltipContent>
    </Tooltip>
  )
}
