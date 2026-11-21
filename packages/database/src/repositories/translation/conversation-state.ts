import { and, type DatabaseClient, db, eq, type SQL, sql } from "../../client"
import { conversationModel } from "../../schema"
import type { ConversationModel } from "../../types"

type ConversationRef = { workspaceId: string; conversationId: string }

// Built per call, not at module load: a module-level `sql` over the schema
// column would run on import and break every test that mocks the schema.
const translationJson = () =>
  sql`COALESCE(${conversationModel.additionalAttributes}->'translation', '{}'::jsonb)`

/**
 * One `jsonb_set` on the parent key `translation`, merging `patch` into the
 * existing object. A nested path such as `{translation,language}` would
 * silently do nothing while `translation` is absent (PostgreSQL requires every
 * step before the last to exist), and a read-modify-write of the whole
 * `additionalAttributes` would overwrite a concurrent `challenge` write.
 */
const mergeTranslation = (patch: SQL, base: SQL = translationJson()) =>
  sql`jsonb_set(COALESCE(${conversationModel.additionalAttributes}, '{}'::jsonb), '{translation}', ${base} || ${patch}, true)`

const languagePatch = (language: string, source: "auto" | "manual") =>
  sql`jsonb_build_object('language', ${language}::text, 'languageSource', ${source}::text, 'updatedAt', ${new Date().toISOString()}::text)`

const conversationWhere = (ref: ConversationRef, extra?: SQL) =>
  and(
    eq(conversationModel.workspaceId, ref.workspaceId),
    eq(conversationModel.id, ref.conversationId),
    extra,
  )

/**
 * Conversation-level translation state under
 * `additionalAttributes.translation`. `Conversation` is read through a cache, so
 * callers must go through `conversationService`, which invalidates after each
 * write; do not call these from a worker or an app directly.
 */
export const conversationTranslationStateRepository = {
  /** `null` clears the override (back to the workspace setting). */
  async setOverride(
    input: ConversationRef & { enabledOverride: boolean | null },
    tx: DatabaseClient = db,
  ): Promise<ConversationModel | null> {
    const now = new Date().toISOString()
    const patch = sql`jsonb_build_object('updatedAt', ${now}::text)`
    const [row] = await tx
      .update(conversationModel)
      .set({
        additionalAttributes:
          input.enabledOverride === null
            ? mergeTranslation(
                patch,
                sql`${translationJson()} - 'enabledOverride'`,
              )
            : mergeTranslation(
                sql`${patch} || jsonb_build_object('enabledOverride', ${input.enabledOverride}::boolean)`,
              ),
      })
      .where(conversationWhere(input))
      .returning()

    return row ?? null
  },

  /** An agent's choice: always written, and never overwritten by detection. */
  async setLanguage(
    input: ConversationRef & { language: string },
    tx: DatabaseClient = db,
  ): Promise<ConversationModel | null> {
    const [row] = await tx
      .update(conversationModel)
      .set({
        additionalAttributes: mergeTranslation(
          languagePatch(input.language, "manual"),
        ),
      })
      .where(conversationWhere(input))
      .returning()

    return row ?? null
  },

  /**
   * Detection result. Written only when the conversation has no language, or
   * when the stored language is an `auto` one equal to the workspace language
   * and the detected language is a different one (the customer had only written
   * in the workspace language so far). A `manual` language is never touched.
   * `null` means nothing was written.
   */
  async setLanguageIfUnset(
    input: ConversationRef & { language: string; workspaceLanguage: string },
    tx: DatabaseClient = db,
  ): Promise<ConversationModel | null> {
    const stored = sql`${conversationModel.additionalAttributes}->'translation'`
    const [row] = await tx
      .update(conversationModel)
      .set({
        additionalAttributes: mergeTranslation(
          languagePatch(input.language, "auto"),
        ),
      })
      .where(
        conversationWhere(
          input,
          sql`(${stored}->>'language' IS NULL
            OR (${stored}->>'languageSource' = 'auto'
              AND ${stored}->>'language' = ${input.workspaceLanguage}::text
              AND ${input.language}::text <> ${input.workspaceLanguage}::text))`,
        ),
      )
      .returning()

    return row ?? null
  },
}
