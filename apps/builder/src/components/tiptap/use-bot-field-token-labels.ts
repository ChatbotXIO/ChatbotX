"use client"

import { useMemo } from "react"
import { useBotFields } from "@/features/custom-fields/provider/custom-field-hook"
import { useWorkspaceId } from "@/hooks/routing"
import { replaceBotFieldVariableTokensWithLabels } from "./extensions/variable-injection/mention"

const BOT_FIELD_TOKEN_MARKER = "{{bot_field:"

/**
 * Replaces `{{bot_field:<id>}}` tokens in a read-only preview text with the
 * field's name. Bot fields are fetched lazily and ONLY when the text actually
 * contains a token, so canvases full of token-free nodes never pay the
 * request. Until labels load (or for a deleted field) the raw token stays.
 */
export function useBotFieldTokenLabels(text: string): string {
  const hasBotFieldTokens = text.includes(BOT_FIELD_TOKEN_MARKER)
  const botFields =
    useBotFields(useWorkspaceId(), { enabled: hasBotFieldTokens }).data ?? []

  const labelById = useMemo(
    () => new Map(botFields.map((field) => [field.id, field.name])),
    [botFields],
  )

  return useMemo(
    () =>
      hasBotFieldTokens
        ? replaceBotFieldVariableTokensWithLabels(text, labelById)
        : text,
    [hasBotFieldTokens, text, labelById],
  )
}
