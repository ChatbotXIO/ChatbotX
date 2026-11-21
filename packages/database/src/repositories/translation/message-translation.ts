import { and, type DatabaseClient, db, eq, inArray, sql } from "../../client"
import type {
  MessageTranslationDirection,
  MessageTranslationFailureCode,
  MessageTranslationStatus,
} from "../../partials/translation"
import { messageTranslationModel } from "../../schema"
import type { MessageTranslationModel } from "../../types"

export type UpsertMessageTranslationInput = {
  workspaceId: string
  conversationId: string
  messageId: string
  messageCreatedAt: Date
  direction: MessageTranslationDirection
  status: MessageTranslationStatus
  sourceLanguage: string | null
  targetLanguage: string
  confidence: number | null
  displayText: string | null
  modelId: string | null
  failureCode: MessageTranslationFailureCode | null
  sourceHash: string | null
}

export const messageTranslationRepository = {
  async findByMessageIds(
    workspaceId: string,
    messageIds: string[],
    tx: DatabaseClient = db,
  ): Promise<MessageTranslationModel[]> {
    if (messageIds.length === 0) {
      return []
    }
    return await tx
      .select()
      .from(messageTranslationModel)
      .where(
        and(
          eq(messageTranslationModel.workspaceId, workspaceId),
          inArray(messageTranslationModel.messageId, messageIds),
        ),
      )
  },

  /**
   * Create-or-replace on `(workspaceId, messageId)`. An existing row is
   * replaced only when it is stale: it `failed`, its source text changed
   * (`sourceHash` differs), or it is an inbound row for another target language
   * than the one being written (the workspace language changed). A good
   * translation of the same text into the same language is never overwritten,
   * so two jobs racing on one message write one row. A `failed` result never
   * replaces a good row for other text in the same language: a slow job that
   * failed on text the customer has since edited must not undo the newer
   * job's translation.
   *
   * Returns the row now stored, or `null` when the existing row was kept.
   */
  async upsertResult(
    input: UpsertMessageTranslationInput,
    tx: DatabaseClient = db,
  ): Promise<MessageTranslationModel | null> {
    const table = messageTranslationModel
    const [row] = await tx
      .insert(table)
      .values(input)
      .onConflictDoUpdate({
        target: [table.workspaceId, table.messageId],
        set: {
          conversationId: input.conversationId,
          messageCreatedAt: input.messageCreatedAt,
          direction: input.direction,
          status: input.status,
          sourceLanguage: input.sourceLanguage,
          targetLanguage: input.targetLanguage,
          confidence: input.confidence,
          displayText: input.displayText,
          modelId: input.modelId,
          failureCode: input.failureCode,
          sourceHash: input.sourceHash,
          updatedAt: sql`CURRENT_TIMESTAMP`,
        },
        setWhere: sql`${table.status} = 'failed'
          OR (excluded."status" <> 'failed'
            AND ${table.sourceHash} IS DISTINCT FROM excluded."sourceHash")
          OR (${table.direction} = 'inbound'
            AND ${table.targetLanguage} IS DISTINCT FROM excluded."targetLanguage")`,
      })
      .returning()

    return row ?? null
  },

  /** Removes the rows of deleted messages; already-gone ones are a no-op. */
  async deleteByMessageIds(
    workspaceId: string,
    messageIds: string[],
    tx: DatabaseClient = db,
  ): Promise<number> {
    if (messageIds.length === 0) {
      return 0
    }
    const deleted = await tx
      .delete(messageTranslationModel)
      .where(
        and(
          eq(messageTranslationModel.workspaceId, workspaceId),
          inArray(messageTranslationModel.messageId, messageIds),
        ),
      )
      .returning({ id: messageTranslationModel.id })

    return deleted.length
  },

  async deleteByMessageId(
    workspaceId: string,
    messageId: string,
    tx: DatabaseClient = db,
  ): Promise<boolean> {
    const deleted = await tx
      .delete(messageTranslationModel)
      .where(
        and(
          eq(messageTranslationModel.workspaceId, workspaceId),
          eq(messageTranslationModel.messageId, messageId),
        ),
      )
      .returning({ id: messageTranslationModel.id })

    return deleted.length > 0
  },
}
