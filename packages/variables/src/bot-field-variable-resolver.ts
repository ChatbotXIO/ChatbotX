import { botFieldWorkspaceCacheTags } from "@chatbotx.io/business"
import { db } from "@chatbotx.io/database/client"
import { withCache } from "@chatbotx.io/redis"
import { parseBotFieldVariableText } from "./bot-field-variable"
import type { BotFieldValue } from "./schema"

const BOT_FIELDS_CACHE_TTL_SECONDS = 5 * 60

export type BotFieldVariableTextResolution =
  | { reason: "malformed"; status: "malformed" }
  | { fieldId: string; reason: "missing"; status: "missing" }
  | { fieldId: string; reason: "empty"; status: "empty" }
  | { status: "resolved"; value: string }

/**
 * Cached workspace-level Bot Field load shared by contact interpolation and
 * workspace-scoped variable resolution. Bot Field writes invalidate the tags.
 */
export const loadBotFields = async (
  workspaceId: string,
): Promise<Map<string, BotFieldValue>> =>
  await withCache(
    `bot-fields:${workspaceId}:variable-map`,
    async () => {
      const rows = await db.query.botFieldModel.findMany({
        where: { workspaceId },
      })

      return new Map(
        rows.map((row) => [row.id, { type: row.type, value: row.value }]),
      )
    },
    {
      ttl: BOT_FIELDS_CACHE_TTL_SECONDS,
      tags: botFieldWorkspaceCacheTags(workspaceId),
    },
  )

export const resolveBotFieldVariableText = async (input: {
  text: string
  workspaceId: string
}): Promise<BotFieldVariableTextResolution> => {
  const parsed = parseBotFieldVariableText(input.text)
  if (parsed.status === "malformed") {
    return { reason: "malformed", status: "malformed" }
  }

  if (parsed.fieldIds.length === 0) {
    return { status: "resolved", value: input.text }
  }

  const botFields = await loadBotFields(input.workspaceId)
  let value = input.text

  for (const fieldId of parsed.fieldIds) {
    const field = botFields.get(fieldId)
    if (!field) {
      return { fieldId, reason: "missing", status: "missing" }
    }
    if (!field.value) {
      return { fieldId, reason: "empty", status: "empty" }
    }
    value = value.replaceAll(`{{bot_field:${fieldId}}}`, field.value)
  }

  return { status: "resolved", value }
}
