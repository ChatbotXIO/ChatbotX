import {
  and,
  type DatabaseClient,
  db,
  eq,
  inArray,
} from "@chatbotx.io/database/client"
import { contactCustomFieldModel } from "@chatbotx.io/database/schema"
import { emitCustomFieldChanged } from "@chatbotx.io/events"
import {
  FieldOperationType,
  FieldReferenceKind,
  parseFieldReference,
} from "@chatbotx.io/flow-config"
import { createId, isNumericId } from "@chatbotx.io/utils"
import {
  canonicalBooleanLiteral,
  canonicalNumberLiteral,
} from "@chatbotx.io/utils/custom-field"
import {
  type SourceTimezoneStrategy,
  TemporalInputParsing,
} from "@chatbotx.io/utils/datetime"
import { BaseService } from "../base.service"
import { botFieldService } from "../bot-field/service"
import { ChatbotXException, notFoundException } from "../errors"
import { logger } from "../logger"
import {
  createSourceTimezoneResolver,
  normalizeCustomFieldValueForStorage,
} from "./normalize"
import { contactCustomFieldValueService } from "./value-service"

type SetValuesInput = {
  workspaceId: string
  contactId: string
  fields: Array<{ customFieldId: string; value: string }>
  /** Browser zone captured at form submit; anchors naive `date` values. */
  sourceTimezone?: string
  /**
   * Strict (default): accept only canonical ISO temporal input. Lenient: run
   * the multi-format parser first (spreadsheet/import-style sources).
   */
  temporalInputParsing?: TemporalInputParsing
  /**
   * Which zone anchors naive temporal values. Defaults to contact -> workspace;
   * the spreadsheet step uses `workspace` to skip the contact lookup.
   */
  sourceTimezoneStrategy?: SourceTimezoneStrategy
  /**
   * An explicit source zone that anchors EVERY temporal type (both `date` and
   * naive `datetime`), short-circuiting the contact/workspace lookup. The flow
   * "set custom field" step passes its captured editor browser zone here so
   * both types resolve against the flow author's zone. Overrides the strategy.
   */
  sourceTimezoneOverride?: string
  /**
   * When a temporal value is blank, stamp the current date/datetime in the
   * resolved source zone instead of persisting an empty string. Used by the
   * flow "set custom field" step so an empty date/datetime records "now".
   */
  fillEmptyTemporalWithNow?: boolean
  /**
   * The `ContactInbox` the caller has in scope (e.g. the flow-step "set
   * custom field" handler) — forwarded to `emitCustomFieldChanges` so the
   * Trigger action that reacts to this change attributes to the right
   * inbox instead of the contact's most-recently-active one.
   */
  contactInboxId?: string
}

/**
 * A single persisted custom-field change awaiting its post-commit side effects.
 * `setValuesInTransaction` returns these so a caller that owns an outer
 * transaction can emit the trigger/webhook events only AFTER it commits.
 */
export type PendingContactCustomFieldChange = {
  customFieldId: string
  customFieldName: string
  oldValue: string | null
  newValue: string
}

type EmitCustomFieldChangesInput = {
  workspaceId: string
  contactId: string
  changes: PendingContactCustomFieldChange[]
  contactInboxId?: string
}

type DeleteByKeyInput = {
  workspaceId: string
  contactId: string
  keyword: string
  contactInboxId?: string
  /**
   * Opt-in only (default false): when true AND `keyword` is a well-formed
   * `bot_field:<id>` reference token, delegate to `botFieldService` instead
   * of the contact-scoped lookup below. Default-false keeps every existing
   * caller (including the public workspace-token contact endpoints) unable
   * to reach Account Fields — see `docs/plans/2026-08-28-account-fields-custom-fields-page.md` §3.2.
   */
  allowBotFields?: boolean
}

type DeleteByCustomFieldIdInput = {
  workspaceId: string
  contactIds: string[]
  customFieldId: string
  tx?: DatabaseClient
}

type InsertNormalizedValuesForNewContactsInput = {
  workspaceId: string
  entries: Array<{
    contactId: string
    fields: Array<{ customFieldId: string; value: string }>
  }>
  tx?: DatabaseClient
}

type SetValueByKeyInput = DeleteByKeyInput & {
  value: string
  /**
   * Explicit source zone anchoring naive `date`/`datetime` values (e.g. a flow
   * step's captured editor browser zone). Forwarded to `setValues`.
   */
  sourceTimezoneOverride?: string
  /** Strict (default) or Lenient multi-format parsing for temporal input. */
  temporalInputParsing?: TemporalInputParsing
  /** Blank temporal value -> stamp "now" in the resolved source zone. */
  fillEmptyTemporalWithNow?: boolean
  /**
   * Consumed ONLY by the bot-field branch (`allowBotFields: true` + a
   * `bot_field:<id>` token) — defaults to `set` there. The contact branch
   * below IGNORES this field and always sets the value, preserving today's
   * set-only behavior byte-for-byte; the contact-field operation no-op is a
   * pre-existing platform bug tracked separately (plan §3.2, Phase 5).
   */
  operation?: FieldOperationType
}

/**
 * Extracts the bot-field key from `keyword` when `allowBotFields` is set AND
 * `keyword` is a well-formed `bot_field:<id>` token — the single dispatch
 * guard shared by `setValueByKey`/`deleteByKey` so both stay in lockstep with
 * the "default-false" opt-in contract documented on `DeleteByKeyInput`.
 */
const resolveBotFieldKey = (
  keyword: string,
  allowBotFields?: boolean,
): string | null => {
  if (!allowBotFields) {
    return null
  }
  const parsed = parseFieldReference(keyword)
  return parsed.kind === FieldReferenceKind.botField ? parsed.id : null
}

// Cache tags for contact-scoped invalidation. Building the full set in one call
// lets a bulk operation invalidate N contacts with a single cache round-trip
// instead of N awaited calls.
const contactCacheTags = (
  workspaceId: string,
  contactIds: string[],
): string[] => [
  "contacts",
  `contacts:${workspaceId}`,
  ...contactIds.map((contactId) => `contacts:${contactId}`),
]

class ContactCustomFieldService extends BaseService {
  async listValues(input: { contactId: string }) {
    return await db.query.contactCustomFieldModel.findMany({
      where: { contactId: input.contactId },
      columns: { customFieldId: true, value: true },
    })
  }

  async findValue(input: {
    contactId: string
    customFieldId: string
  }): Promise<string | null> {
    return await contactCustomFieldValueService.findValue(input)
  }

  async listWithDefinitions(input: {
    contactId: string
    tx?: DatabaseClient
  }): Promise<{ name: string; value: string }[]> {
    const { contactId, tx = db } = input
    const rows = await tx.query.contactCustomFieldModel.findMany({
      where: { contactId },
      columns: { value: true },
      with: {
        customField: {
          columns: { name: true },
        },
      },
      orderBy: { id: "asc" },
    })
    return rows.map((row) => ({
      name: row.customField.name,
      value: row.value,
    }))
  }

  /**
   * Persists the changed field values against `client` and returns the changes
   * as pending side effects. This is write-only: it never emits events or
   * invalidates caches, so it is safe to run inside a caller's transaction.
   */
  private async writeValues(
    input: SetValuesInput,
    client: DatabaseClient,
  ): Promise<PendingContactCustomFieldChange[]> {
    const {
      workspaceId,
      contactId,
      fields,
      sourceTimezone,
      temporalInputParsing,
      sourceTimezoneStrategy,
      sourceTimezoneOverride,
      fillEmptyTemporalWithNow,
    } = input
    const customFieldIds = fields.map((f) => f.customFieldId)
    const fieldById = new Map(
      fields.map((field) => [field.customFieldId, field] as const),
    )

    const customFields = await client.query.customFieldModel.findMany({
      where: { workspaceId, id: { in: customFieldIds } },
      columns: { id: true, name: true, type: true },
    })

    if (customFields.length === 0) {
      return []
    }

    const existingValues = await client.query.contactCustomFieldModel.findMany({
      where: { contactId, customFieldId: { in: customFieldIds } },
    })
    const existingById = new Map(
      existingValues.map((value) => [value.customFieldId, value] as const),
    )
    const resolveSourceTimezone = createSourceTimezoneResolver({
      workspaceId,
      contactId,
      strategy: sourceTimezoneStrategy,
      explicitSourceTimezone: sourceTimezoneOverride,
      tx: client,
    })

    const changedFields = await Promise.all(
      customFields.map(async (customField) => {
        const field = fieldById.get(customField.id)
        if (!field) {
          return null
        }

        const normalizedValue = await normalizeCustomFieldValueForStorage({
          type: customField.type,
          value: field.value,
          resolveSourceTimezone,
          explicitTimezone: sourceTimezone,
          temporalInputParsing,
          fillEmptyTemporalWithNow,
        })
        // Un-normalizable temporal value: skip rather than persist garbage.
        if (normalizedValue === null) {
          if (temporalInputParsing === TemporalInputParsing.Lenient) {
            logger.warn(
              {
                workspaceId,
                contactId,
                customFieldId: customField.id,
                type: customField.type,
              },
              "Skipped unparseable temporal custom-field value from a lenient source",
            )
          }
          return null
        }
        const existing = existingById.get(customField.id)
        if (existing?.value === normalizedValue) {
          return null
        }

        return {
          customField,
          existing,
          oldValue: existing?.value ?? null,
          value: normalizedValue,
        }
      }),
    )

    const valuesToPersist = changedFields.filter(
      (field) => field !== null,
    ) as NonNullable<(typeof changedFields)[number]>[]

    if (valuesToPersist.length === 0) {
      return []
    }

    await Promise.all(
      valuesToPersist.map(({ customField, value, existing }) => {
        if (existing) {
          return client
            .update(contactCustomFieldModel)
            .set({ value })
            .where(eq(contactCustomFieldModel.id, existing.id))
        }
        return client
          .insert(contactCustomFieldModel)
          .values({
            id: createId(),
            contactId,
            customFieldId: customField.id,
            value,
          })
          .onConflictDoUpdate({
            target: [
              contactCustomFieldModel.contactId,
              contactCustomFieldModel.customFieldId,
            ],
            set: { value },
          })
      }),
    )

    return valuesToPersist.map(({ customField, oldValue, value }) => ({
      customFieldId: customField.id,
      customFieldName: customField.name,
      oldValue,
      newValue: value,
    }))
  }

  async setValues(
    input: SetValuesInput,
    tx: DatabaseClient = db,
  ): Promise<void> {
    // No caller transaction: own one so the reads and writes are consistent.
    // A caller-supplied `tx` writes inside their transaction and — like the
    // legacy behavior — emits before it commits; callers that need commit-safe
    // ordering use setValuesInTransaction + emitCustomFieldChanges instead.
    const changes =
      tx === db
        ? await tx.transaction((innerTx) => this.writeValues(input, innerTx))
        : await this.writeValues(input, tx)

    await this.emitCustomFieldChanges({
      workspaceId: input.workspaceId,
      contactId: input.contactId,
      changes,
      contactInboxId: input.contactInboxId,
    })
  }

  /**
   * Write-only variant for callers that own an outer transaction. Persists the
   * values inside `tx` and returns the pending changes; the caller MUST call
   * `emitCustomFieldChanges` once the transaction commits. Emitting inside the
   * transaction would let the trigger worker (which re-reads the value) observe
   * uncommitted or rolled-back data.
   */
  async setValuesInTransaction(
    input: SetValuesInput,
    tx: DatabaseClient,
  ): Promise<PendingContactCustomFieldChange[]> {
    return await this.writeValues(input, tx)
  }

  /**
   * Emits one customFieldChanged event per change, then invalidates the contact
   * cache once. Cache invalidation is unconditional (cheap and idempotent) so a
   * no-op write still refreshes any stale cache. Emission is fire-and-forget:
   * a failed enqueue is logged, not thrown, so it never blocks the caller.
   */
  async emitCustomFieldChanges(
    input: EmitCustomFieldChangesInput,
  ): Promise<void> {
    const { workspaceId, contactId, changes, contactInboxId } = input

    for (const change of changes) {
      emitCustomFieldChanged(
        workspaceId,
        contactId,
        change.customFieldId,
        change.customFieldName,
        change.oldValue,
        change.newValue,
        contactInboxId,
      ).catch((error: unknown) => {
        logger.warn(
          {
            err: error,
            workspaceId,
            contactId,
            customFieldId: change.customFieldId,
          },
          "Failed to emit customFieldChanged event",
        )
      })
    }

    await this.invalidate({ workspaceId, contactId })
  }

  async clearByContactId(input: {
    workspaceId: string
    contactId: string
    tx?: DatabaseClient
  }): Promise<void> {
    const { tx = db } = input
    await tx
      .delete(contactCustomFieldModel)
      .where(eq(contactCustomFieldModel.contactId, input.contactId))
    await this.invalidate(input)
  }

  async deleteByCustomFieldId(
    input: DeleteByCustomFieldIdInput,
  ): Promise<void> {
    const { workspaceId, contactIds, customFieldId, tx = db } = input
    if (contactIds.length === 0) {
      return
    }

    await tx
      .delete(contactCustomFieldModel)
      .where(
        and(
          inArray(contactCustomFieldModel.contactId, contactIds),
          eq(contactCustomFieldModel.customFieldId, customFieldId),
        ),
      )

    // Bulk delete stays event-free by design: emitting customFieldChanged per
    // contact would enqueue one trigger/webhook job per affected contact, so
    // clearing a field across a large audience could burst the queues. The
    // single-contact clear (deleteByKey / flow-step clearContactCustomField) is
    // the only delete that emits. Cache is invalidated in one batched call.
    await this.invalidateCacheTags(contactCacheTags(workspaceId, contactIds))
  }

  async insertNormalizedValuesForNewContacts(
    input: InsertNormalizedValuesForNewContactsInput,
  ): Promise<void> {
    const { workspaceId, entries, tx = db } = input
    const values = entries.flatMap(({ contactId, fields }) =>
      fields.map((field) => ({
        id: createId(),
        contactId,
        customFieldId: field.customFieldId,
        value: field.value,
      })),
    )

    if (values.length === 0) {
      return
    }

    await this.assertValuesAreCanonical({ workspaceId, values, tx })
    await tx.insert(contactCustomFieldModel).values(values)
  }

  /**
   * The import fast-path above bypasses `writeValues` (and its per-type
   * normalization) for throughput — its CONTRACT is that the caller already
   * normalized every value. This guard makes the boundary self-preserving:
   * a future caller passing a non-canonical boolean/number fails fast with a
   * typed error instead of silently persisting garbage. Temporal/text stay
   * on the caller's contract (validating them here would need the timezone
   * plumbing the fast-path exists to avoid). One batched, indexed query;
   * canonical inputs (the only ones the importer produces) pass untouched.
   */
  private async assertValuesAreCanonical(props: {
    workspaceId: string
    values: Array<{ customFieldId: string; value: string }>
    tx: DatabaseClient
  }): Promise<void> {
    const { workspaceId, values, tx } = props
    const typeById = new Map(
      (
        await tx.query.customFieldModel.findMany({
          where: {
            workspaceId,
            id: { in: [...new Set(values.map((v) => v.customFieldId))] },
          },
          columns: { id: true, type: true },
        })
      ).map((field) => [field.id, field.type] as const),
    )

    for (const { customFieldId, value } of values) {
      if (value.length === 0) {
        continue
      }
      const type = typeById.get(customFieldId)
      const isCanonical =
        (type === "boolean" && canonicalBooleanLiteral(value) === value) ||
        (type === "number" && canonicalNumberLiteral(value) === value)
      if ((type === "boolean" || type === "number") && !isCanonical) {
        throw new ChatbotXException(
          `Non-canonical ${type} value for custom field ${customFieldId}; normalize before calling insertNormalizedValuesForNewContacts.`,
          "invalidCustomFieldValue",
          400,
        )
      }
    }
  }

  async setValueByKey(input: SetValueByKeyInput): Promise<void> {
    const {
      workspaceId,
      contactId,
      keyword,
      value,
      sourceTimezoneOverride,
      temporalInputParsing,
      fillEmptyTemporalWithNow,
      contactInboxId,
      allowBotFields,
      operation,
    } = input

    const botFieldKey = resolveBotFieldKey(keyword, allowBotFields)
    if (botFieldKey) {
      await botFieldService.applyValueOperation({
        workspaceId,
        key: botFieldKey,
        operation: operation ?? FieldOperationType.set,
        value,
        sourceTimezoneOverride,
        temporalInputParsing,
        fillEmptyTemporalWithNow,
      })
      return
    }

    let customField: { id: string } | undefined

    if (isNumericId(keyword)) {
      customField = await db.query.customFieldModel.findFirst({
        where: { id: keyword, workspaceId },
        columns: { id: true },
      })
    }

    if (!customField) {
      customField = await db.query.customFieldModel.findFirst({
        where: { name: keyword, workspaceId },
        columns: { id: true },
      })
    }

    if (!customField) {
      throw notFoundException("Custom field not found")
    }

    await this.setValues({
      workspaceId,
      contactId,
      fields: [{ customFieldId: customField.id, value }],
      sourceTimezoneOverride,
      temporalInputParsing,
      fillEmptyTemporalWithNow,
      contactInboxId,
    })
  }

  async deleteByKey(input: DeleteByKeyInput): Promise<void> {
    const { workspaceId, contactId, keyword, contactInboxId, allowBotFields } =
      input

    const botFieldKey = resolveBotFieldKey(keyword, allowBotFields)
    if (botFieldKey) {
      await botFieldService.clearValueByKey({ workspaceId, key: botFieldKey })
      return
    }

    let customField: { id: string; name: string } | undefined

    if (isNumericId(keyword)) {
      customField = await db.query.customFieldModel.findFirst({
        where: { id: keyword, workspaceId },
        columns: { id: true, name: true },
      })
    }

    if (!customField) {
      customField = await db.query.customFieldModel.findFirst({
        where: { name: keyword, workspaceId },
        columns: { id: true, name: true },
      })
    }

    if (!customField) {
      throw notFoundException("Custom field not found")
    }

    // Single-contact clear is the only delete that emits a change event. Snapshot
    // the value BEFORE deleting so we emit an accurate value -> null and stay
    // silent on a no-op delete (the contact never held the field). The bulk path
    // owns the delete + batched cache invalidation; emission is bounded to one
    // event here, which is queue-safe unlike a per-contact fan-out.
    const oldValue = await this.findValue({
      contactId,
      customFieldId: customField.id,
    })

    await this.deleteByCustomFieldId({
      workspaceId,
      contactIds: [contactId],
      customFieldId: customField.id,
    })

    if (oldValue === null) {
      return
    }

    emitCustomFieldChanged(
      workspaceId,
      contactId,
      customField.id,
      customField.name,
      oldValue,
      null,
      contactInboxId,
    ).catch((error: unknown) => {
      logger.warn(
        { err: error, workspaceId, contactId, customFieldId: customField.id },
        "Failed to emit customFieldChanged event",
      )
    })
  }

  async invalidate(props: {
    workspaceId: string
    contactId: string
  }): Promise<void> {
    await this.invalidateCacheTags(
      contactCacheTags(props.workspaceId, [props.contactId]),
    )
  }
}

export const contactCustomFieldService = new ContactCustomFieldService()
