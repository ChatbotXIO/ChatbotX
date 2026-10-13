"use client"

import { MultiSelectField } from "@chatbotx.io/ui/components/form/multi-select-field"
import { useQuery } from "@tanstack/react-query"
import { useTranslations } from "next-intl"
import { useMemo } from "react"
import { listTelegramChatsAction } from "../../actions/list-telegram-chats.action"
import type { LeaderboardWizardInput } from "../../lib/wizard-schema"

/** Groups/channels where the Telegram bot is an admin. */
export function TelegramChatsField({
  workspaceId,
  inboxId,
  disabled,
}: {
  workspaceId: string
  inboxId: string | null
  disabled?: boolean
}) {
  const t = useTranslations()
  const { data: chats = [], isLoading } = useQuery({
    queryKey: ["leaderboard-telegram-chats", workspaceId, inboxId],
    queryFn: async () => {
      const result = await listTelegramChatsAction.bind(
        null,
        workspaceId,
      )({ inboxId: inboxId ?? "" })
      return result?.data ?? []
    },
    enabled: Boolean(inboxId),
  })
  const options = useMemo(
    () =>
      chats.map((chat) => ({
        label: chat.title ?? chat.chatId,
        value: chat.chatId,
      })),
    [chats],
  )

  return (
    <div className="flex flex-col gap-1">
      <MultiSelectField<LeaderboardWizardInput>
        description={t("leaderboards.wizard.telegramChatsHint")}
        disabled={disabled || !inboxId || isLoading}
        key={inboxId ?? "none"}
        label={t("leaderboards.wizard.telegramChats")}
        name="scope.telegramChatIds"
        options={options}
        placeholder={
          inboxId && !isLoading && options.length === 0
            ? t("leaderboards.wizard.telegramChatsEmpty")
            : t("actions.pleaseSelect")
        }
      />
    </div>
  )
}
