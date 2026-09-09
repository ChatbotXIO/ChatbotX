import { db, eq } from "@chatbotx.io/database/client"
import { integrationModel } from "@chatbotx.io/database/schema"
import { AuthType, type SecretTextAuthValue } from "@chatbotx.io/sdk"
import { createId } from "@chatbotx.io/utils"
import type { AnyPgTable } from "drizzle-orm/pg-core"

type AiProviderTable = AnyPgTable & {
  id: unknown
  integrationId: unknown
  workspaceId: unknown
}

export type ConnectAiProviderInput = {
  workspaceId: string
  apiKey: string
  model: string
  temperature: number
  maxOutputTokens: number
}

/**
 * Shared connect logic for the claude/deepseek/gemini/openai tables — they are
 * structurally identical (auth/model/temperature/maxOutputTokens/workspaceId/
 * integrationId), so a single upsert-by-workspace routine avoids four
 * copy-paste clones. Callers pass their own table + integrationType; extra
 * per-provider columns (e.g. openai's autoReplyVoice) are layered on by the
 * caller via `extraInsertValues`/`extraUpdateValues`.
 *
 * The insert/update value objects are cast to `never` rather than the table
 * itself — dispatching a single write across four structurally-similar but
 * not statically-unifiable table types is the deliberate tradeoff of this
 * consolidation; each table's own schema still enforces shape at the DB
 * layer, and this function only ever writes the columns all four share.
 */
export async function connectAiProviderIntegration(props: {
  table: AiProviderTable
  integrationType: string
  input: ConnectAiProviderInput
  existing: { id: string } | null | undefined
  extraInsertValues?: Record<string, unknown>
  extraUpdateValues?: Record<string, unknown>
}) {
  const auth: SecretTextAuthValue = {
    authType: AuthType.secretText,
    secretText: props.input.apiKey,
  }

  await db.transaction(async (tx) => {
    if (props.existing) {
      await tx
        .update(props.table)
        .set({
          model: props.input.model,
          auth,
          temperature: props.input.temperature,
          maxOutputTokens: props.input.maxOutputTokens,
          ...props.extraUpdateValues,
        } as never)
        .where(eq(props.table.id as never, props.existing.id))
      return
    }

    const [integration] = await tx
      .insert(integrationModel)
      .values({
        id: createId(),
        workspaceId: props.input.workspaceId,
        integrationType: props.integrationType,
      })
      .returning()

    if (!integration) {
      throw new Error("Failed to create integration record")
    }

    await tx.insert(props.table).values({
      id: createId(),
      integrationId: integration.id,
      workspaceId: props.input.workspaceId,
      model: props.input.model,
      auth,
      temperature: props.input.temperature,
      maxOutputTokens: props.input.maxOutputTokens,
      ...props.extraInsertValues,
    } as never)
  })
}
