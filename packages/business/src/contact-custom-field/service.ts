import {
  and,
  type DatabaseClient,
  db,
  eq,
  inArray,
  sql,
} from "@chatbotx.io/database/client"
import type { CustomFieldType } from "@chatbotx.io/database/partials"
import { contactCustomFieldRepository } from "@chatbotx.io/database/repositories"
import { contactCustomFieldModel } from "@chatbotx.io/database/schema"
import {
  type DecisionFlowOrigin,
  emitCustomFieldChanged,
} from "@chatbotx.io/events"
import {
  FieldOperationType,
  FieldReferenceKind,
  isBotFieldReference,
  parseFieldReference,
} from "@chatbotx.io/flow-config"
import { createId, isNumericId } from "@chatbotx.io/utils"
import {
  canonicalBooleanLiteral,
  canonicalNumberLiteral,
} from "@chatbotx.io/utils/custom-field"
import {
  DEFAULT_FILTER_TIMEZONE,
  isTemporalCustomFieldType,
  type SourceTimezoneStrategy,
  TemporalInputParsing,
} from "@chatbotx.io/utils/datetime"
import {
  calculateFieldValue,
  type FieldValueCalculationResult,
} from "@chatbotx.io/utils/field-value-calculator"
import { BaseService } from "../base.service"
import { botFieldService } from "../bot-field/service"
import { type ContactAccessScope, contactService } from "../contact/service"
import { customFieldService } from "../custom-field/service"
import {
  ChatbotXException,
  invalidFieldOperationException,
  notFoundException,
} from "../errors"
import { logger } from "../logger"
import {
  createSourceTimezoneResolver,
  normalizeCustomFieldValueForStorage,
  type SourceTimezoneResolver,
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
  /**
   * Refresh `updatedAt` on a field whose value is unchanged, without emitting a
   * change event. Get User Data (Location) sets it so a re-shared identical
   * location still counts as the newest one for `listValuesByKeys`.
   */
  touchUnchanged?: boolean
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
  /** `null` when the change deleted the value. */
  newValue: string | null
}

export type FieldOperationRequest = {
  contactId: string
  customFieldId: string
  operation: FieldOperationType
  /** Already `{{variable}}`-resolved by the caller. */
  operand: string
}

export type ApplyFieldOperationsInput = {
  workspaceId: string
  /** Applied in order; a later operation sees the earlier ones' result. */
  operations: FieldOperationRequest[]
  accessScope?: ContactAccessScope
  contactInboxId?: string
  /** Browser zone captured at submit; anchors the clock and naive `date`. */
  sourceTimezone?: string
  /** Anchors the clock and every naive temporal type (the flow step's zone). */
  sourceTimezoneOverride?: string
  temporalInputParsing?: TemporalInputParsing
  fillEmptyTemporalWithNow?: boolean
}

type ResolvedFieldOperation = {
  request: FieldOperationRequest
  customField: { id: string; name: string; type: CustomFieldType }
}

type PendingChangesByContact = Map<string, PendingContactCustomFieldChange[]>

type OperationContext = {
  tx: DatabaseClient
  workspaceId: string
  request: FieldOperationRequest
  customField: ResolvedFieldOperation["customField"]
  timeZone: string
  options: ApplyFieldOperationsInput
  /** Throw on a rejected operation instead of skipping it. */
  strict: boolean
}

type ResultApplier<Kind extends FieldValueCalculationResult["kind"]> = (
  result: Extract<FieldValueCalculationResult, { kind: Kind }>,
  context: OperationContext,
) => Promise<PendingContactCustomFieldChange[]>

type ResultAppliers = {
  [Kind in FieldValueCalculationResult["kind"]]: ResultApplier<Kind>
}

type EmitCustomFieldChangesInput = {
  workspaceId: string
  contactId: string
  changes: PendingContactCustomFieldChange[]
  contactInboxId?: string
  decisionFlowOrigin?: DecisionFlowOrigin
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
   * to reach Account Fields.
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
   * The operation to apply, defaulting to `set`. Bot fields and contact fields
   * both honor it; a non-`set` contact operation runs through
   * `applyFieldOperations` (lock, calculate, write, emit after commit).
   */
  operation?: FieldOperationType
  /** Forwarded to `setValues`; ignored by the bot-field branch. */
  touchUnchanged?: boolean
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
  async listSelectedDefinitionValuesByContact(input: {
    contactId: string
    customFieldIds: string[]
    workspaceId: string
  }) {
    return await contactCustomFieldRepository.listSelectedDefinitionValuesByContact(
      input,
    )
  }

  /**
   * The single entry point for every field operation, on one contact or many.
   * In one transaction it locks each `(contact, field)` pair (global order, so
   * concurrent calls cannot deadlock), reads all current values in one query,
   * calculates each result with the pure calculator and applies it. Events and
   * cache invalidation fire only after the commit, exactly once.
   *
   * A rejected operation throws `invalidFieldOperation` (rolling everything
   * back) when the call targets one contact, and is skipped and logged when
   * it spans several (a bulk edit).
   */
  async applyFieldOperations(input: ApplyFieldOperationsInput): Promise<void> {
    const { workspaceId } = input
    const contacts = await contactService.findManyByIds({
      workspaceId,
      ids: [...new Set(input.operations.map(({ contactId }) => contactId))],
      accessScope: input.accessScope,
    })
    const accessibleContactIds = new Set(contacts.map(({ id }) => id))
    const operations = input.operations.filter(({ contactId }) =>
      accessibleContactIds.has(contactId),
    )
    if (operations.length === 0) {
      return
    }

    const customFields = await customFieldService.findManyByIds({
      workspaceId,
      ids: [...new Set(operations.map(({ customFieldId }) => customFieldId))],
    })
    const customFieldById = new Map(
      customFields.map((customField) => [customField.id, customField] as const),
    )
    const resolved = operations.map((request): ResolvedFieldOperation => {
      const customField = customFieldById.get(request.customFieldId)
      if (!customField) {
        throw notFoundException("Custom field not found")
      }
      return { request, customField }
    })

    const pending = await db.transaction((tx) =>
      this.applyFieldOperationsInTransaction(input, resolved, tx),
    )

    await Promise.all(
      [...pending].map(([contactId, changes]) =>
        this.emitCustomFieldChanges({
          workspaceId,
          contactId,
          changes,
          contactInboxId: input.contactInboxId,
        }),
      ),
    )
  }

  private async applyFieldOperationsInTransaction(
    input: ApplyFieldOperationsInput,
    operations: ResolvedFieldOperation[],
    tx: DatabaseClient,
  ): Promise<PendingChangesByContact> {
    const { workspaceId } = input
    const requests = operations.map(({ request }) => request)
    const contactIds = [...new Set(requests.map(({ contactId }) => contactId))]
    await contactCustomFieldRepository.lockPairs(tx, requests)
    const storedValues = await contactCustomFieldRepository.listValuesForPairs(
      {
        contactIds,
        customFieldIds: [
          ...new Set(requests.map(({ customFieldId }) => customFieldId)),
        ],
      },
      tx,
    )
    const currentValues = new Map(
      storedValues.map((row) => [
        `${row.contactId}:${row.customFieldId}`,
        row.value,
      ]),
    )
    const strict = contactIds.length === 1
    const timeZoneResolvers = new Map<string, SourceTimezoneResolver>()
    const timeZoneResolverFor = (contactId: string): SourceTimezoneResolver => {
      let resolver = timeZoneResolvers.get(contactId)
      if (!resolver) {
        resolver = createSourceTimezoneResolver({
          workspaceId,
          contactId,
          explicitSourceTimezone:
            input.sourceTimezoneOverride ?? input.sourceTimezone,
          tx,
        })
        timeZoneResolvers.set(contactId, resolver)
      }
      return resolver
    }
    const pending: PendingChangesByContact = new Map()

    for (const { request, customField } of operations) {
      const key = `${request.contactId}:${request.customFieldId}`
      const timeZone = isTemporalCustomFieldType(customField.type)
        ? await timeZoneResolverFor(request.contactId)()
        : DEFAULT_FILTER_TIMEZONE
      const result = calculateFieldValue({
        fieldType: customField.type,
        operation: request.operation,
        currentValue: currentValues.get(key) ?? null,
        operand: request.operand,
        clock: { now: new Date(), timeZone },
      })
      const changes = await this.applyResult(result, {
        tx,
        workspaceId,
        request,
        customField,
        timeZone,
        options: input,
        strict,
      })
      for (const change of changes) {
        if (change.newValue === null) {
          currentValues.delete(key)
        } else {
          currentValues.set(key, change.newValue)
        }
      }
      const contactChanges = pending.get(request.contactId) ?? []
      contactChanges.push(...changes)
      pending.set(request.contactId, contactChanges)
    }
    return pending
  }

  private readonly resultAppliers: ResultAppliers = {
    set: (result, context) => this.applySetResult(result.value, context),
    clear: async (_result, { tx, request, customField }) => {
      const oldValue = await contactCustomFieldRepository.deleteValue(
        { contactId: request.contactId, customFieldId: customField.id },
        tx,
      )
      return oldValue === null
        ? []
        : [
            {
              customFieldId: customField.id,
              customFieldName: customField.name,
              oldValue,
              newValue: null,
            },
          ]
    },
    unchanged: () => Promise.resolve([]),
    rejected: ({ reason }, { strict, workspaceId, request }) => {
      if (strict) {
        throw invalidFieldOperationException(reason)
      }
      logger.warn(
        { workspaceId, ...request, reason },
        "Skipped a rejected custom-field operation",
      )
      return Promise.resolve([])
    },
  }

  private applyResult(
    result: FieldValueCalculationResult,
    context: OperationContext,
  ): Promise<PendingContactCustomFieldChange[]> {
    const apply = this.resultAppliers[result.kind] as ResultApplier<
      typeof result.kind
    >
    return apply(result, context)
  }

  /**
   * A calculated value is already canonical and in the clock's zone, so it is
   * written strictly in that zone; a plain `set` keeps the caller's options.
   */
  private applySetResult(
    value: string,
    context: OperationContext,
  ): Promise<PendingContactCustomFieldChange[]> {
    const { tx, workspaceId, request, customField, options } = context
    const isPlainSet = request.operation === FieldOperationType.set
    return this.writeValues(
      {
        workspaceId,
        contactId: request.contactId,
        fields: [{ customFieldId: customField.id, value }],
        sourceTimezone: options.sourceTimezone,
        sourceTimezoneOverride: isPlainSet
          ? options.sourceTimezoneOverride
          : context.timeZone,
        temporalInputParsing: isPlainSet
          ? options.temporalInputParsing
          : TemporalInputParsing.Strict,
        fillEmptyTemporalWithNow: isPlainSet
          ? options.fillEmptyTemporalWithNow
          : undefined,
      },
      tx,
    )
  }

  async applyOperationToContacts(input: {
    workspaceId: string
    contactIds: string[]
    customFieldId: string
    operation: FieldOperationType
    value: string
    sourceTimezone?: string
    accessScope?: ContactAccessScope
  }) {
    await this.applyFieldOperations({
      workspaceId: input.workspaceId,
      operations: input.contactIds.map((contactId) => ({
        contactId,
        customFieldId: input.customFieldId,
        operation: input.operation,
        operand: input.value,
      })),
      sourceTimezone: input.sourceTimezone,
      accessScope: input.accessScope,
    })
  }

  /**
   * The public `PATCH .../custom-fields` handler's call: operations on one
   * contact, in order, as one all-or-nothing unit.
   */
  async applyOperations(input: {
    workspaceId: string
    contactId: string
    operations: Array<{
      customFieldId: string
      operation: FieldOperationType
      value: string
    }>
    sourceTimezone?: string
    accessScope?: ContactAccessScope
  }): Promise<void> {
    await this.applyFieldOperations({
      workspaceId: input.workspaceId,
      operations: input.operations.map((operation) => ({
        contactId: input.contactId,
        customFieldId: operation.customFieldId,
        operation: operation.operation,
        operand: operation.value,
      })),
      sourceTimezone: input.sourceTimezone,
      accessScope: input.accessScope,
    })
  }

  async setValueForContact(input: {
    workspaceId: string
    contactId: string
    customFieldId: string
    value: string
    sourceTimezone?: string
    accessScope?: ContactAccessScope
  }) {
    await contactService.findByIdOrFail({
      workspaceId: input.workspaceId,
      id: input.contactId,
      accessScope: input.accessScope,
    })
    const [customField] = await customFieldService.findManyByIds({
      workspaceId: input.workspaceId,
      ids: [input.customFieldId],
    })
    if (!customField) {
      throw notFoundException("Custom field not found")
    }
    await this.setValues({
      workspaceId: input.workspaceId,
      contactId: input.contactId,
      fields: [{ customFieldId: customField.id, value: input.value }],
      sourceTimezone: input.sourceTimezone,
    })
  }
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

  listWithDefinitionByContact(input: {
    contactId: string
    workspaceId: string
  }) {
    return contactCustomFieldRepository.listWithDefinitionByContact(input)
  }

  findWithDefinition(input: {
    contactId: string
    customFieldId: string
    workspaceId: string
  }) {
    return contactCustomFieldRepository.findWithDefinition(input)
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
      touchUnchanged,
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
          if (touchUnchanged) {
            await client
              .update(contactCustomFieldModel)
              .set({ updatedAt: sql`CURRENT_TIMESTAMP` })
              .where(eq(contactCustomFieldModel.id, existing.id))
          }
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
    const {
      workspaceId,
      contactId,
      changes,
      contactInboxId,
      decisionFlowOrigin,
    } = input

    for (const change of changes) {
      emitCustomFieldChanged(
        workspaceId,
        contactId,
        change.customFieldId,
        change.customFieldName,
        change.oldValue,
        change.newValue,
        contactInboxId,
        decisionFlowOrigin,
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
      touchUnchanged,
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

    if (operation && operation !== FieldOperationType.set) {
      await this.applyFieldOperations({
        workspaceId,
        operations: [
          {
            contactId,
            customFieldId: customField.id,
            operation,
            operand: value,
          },
        ],
        contactInboxId,
        sourceTimezoneOverride,
        temporalInputParsing,
        fillEmptyTemporalWithNow,
      })
      return
    }

    await this.setValues({
      workspaceId,
      contactId,
      fields: [{ customFieldId: customField.id, value }],
      sourceTimezoneOverride,
      temporalInputParsing,
      fillEmptyTemporalWithNow,
      contactInboxId,
      touchUnchanged,
    })
  }

  /**
   * The contact's values for flow field references (id or legacy name,
   * resolved like `setValueByKey`), newest write first. Bot-field tokens and
   * keys that match no field are ignored.
   */
  async listValuesByKeys(input: {
    workspaceId: string
    contactId: string
    keys: string[]
  }): Promise<{ key: string; value: string; updatedAt: Date }[]> {
    const keys = [...new Set(input.keys)].filter(
      (key) => key && !isBotFieldReference(key),
    )
    if (keys.length === 0) {
      return []
    }

    const rows = await contactCustomFieldRepository.listValuesByFieldKeys({
      workspaceId: input.workspaceId,
      contactId: input.contactId,
      ids: keys.filter((key) => isNumericId(key)),
      names: keys,
    })

    const values: { key: string; value: string; updatedAt: Date }[] = []
    for (const key of keys) {
      const row =
        rows.find((candidate) => candidate.customFieldId === key) ??
        rows.find((candidate) => candidate.name === key)
      if (row) {
        values.push({ key, value: row.value, updatedAt: row.updatedAt })
      }
    }
    return values.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
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
