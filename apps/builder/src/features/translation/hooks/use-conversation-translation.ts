"use client"

import { useMemo } from "react"
import { useChatStore } from "@/features/chat/store/chat-store-provider"
import { isConversationActive } from "@/features/conversations/utils/bot-state"
import { resolveThreadControlView } from "@/features/conversations/utils/thread-control"
import {
  isConversationTranslationOn,
  readConversationTranslation,
} from "../lib/conversation-translation"
import { useTranslationSettings } from "./use-translation-settings"

export type ActiveConversationTranslation = {
  /** The workspace switch is on (settings loaded). */
  workspaceEnabled: boolean
  /** An agent's choice, or else off while the bot is on duty (see `isConversationTranslationOn`). */
  conversationEnabled: boolean
  /** Translation applies to the open conversation. */
  effective: boolean
  /** The open conversation shows "Bot is active". */
  botActive: boolean
  /** The bot is active, or an agent took it over until it resumes. */
  botOnDuty: boolean
  /** An agent turned translation off for this conversation. */
  turnedOff: boolean
  /** An agent turned translation on for this conversation. */
  turnedOn: boolean
  workspaceLanguage: string | null
  language: string | null
  languageSource: "auto" | "manual" | null
}

/**
 * Whether and how translation applies to the open conversation, from the cached
 * workspace settings and the conversation's own state in the chat store. While
 * the settings load (or when the workspace has it off) everything is "off", so
 * the Inbox behaves exactly as it did before the feature.
 *
 * While the bot is on duty (active, or taken over by an agent until it
 * resumes) nothing is translated until an agent turns it on.
 */
export function useConversationTranslation(): ActiveConversationTranslation {
  const { data: settings } = useTranslationSettings()
  const additionalAttributes = useChatStore(
    (state) =>
      state.conversations.find(
        (conversation) => conversation.id === state.activeConversationId,
      )?.additionalAttributes,
  )
  // "active": same condition as the "Bot is active" label (the bot is enabled
  // and the thread is not on standby, where another responder owns it).
  // "paused": an agent took the bot over and it resumes at `botResumeAt`.
  // A string, so a bubble does not re-render on every conversation update.
  const botDuty = useChatStore((state): "active" | "paused" | null => {
    const conversation = state.conversations.find(
      (item) => item.id === state.activeConversationId,
    )
    if (
      !conversation ||
      resolveThreadControlView(conversation, new Date())?.state === "standby"
    ) {
      return null
    }
    if (isConversationActive(conversation)) {
      return "active"
    }
    return conversation.botResumeAt ? "paused" : null
  })

  return useMemo(() => {
    const own = readConversationTranslation({ additionalAttributes })
    const workspaceEnabled = settings?.enabled === true
    const conversationEnabled = isConversationTranslationOn({
      enabledOverride: own.enabledOverride,
      botOnDuty: botDuty !== null,
    })
    return {
      workspaceEnabled,
      conversationEnabled,
      effective: workspaceEnabled && conversationEnabled,
      botActive: botDuty === "active",
      botOnDuty: botDuty !== null,
      turnedOff: own.enabledOverride === false,
      turnedOn: own.enabledOverride === true,
      workspaceLanguage: settings?.workspaceLanguage ?? null,
      language: own.language,
      languageSource: own.languageSource,
    }
  }, [additionalAttributes, botDuty, settings])
}
