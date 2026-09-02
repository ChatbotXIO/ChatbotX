"use client"

import { useEffect, useMemo } from "react"
import { useCustomFieldStore } from "@/features/custom-fields/provider/custom-field-store-context"
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
  const { botFields, ensureBotFieldsLoaded } = useCustomFieldStore(
    (state) => state,
  )

  useEffect(() => {
    if (hasBotFieldTokens) {
      ensureBotFieldsLoaded()
    }
  }, [hasBotFieldTokens, ensureBotFieldsLoaded])

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
