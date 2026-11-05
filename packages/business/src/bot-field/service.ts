import {
  and,
  type DatabaseClient,
  db,
  eq,
  inArray,
  isUniqueViolationError,
  relationsFilterToSQL,
  type SQL,
  sql,
} from "@chatbotx.io/database/client"
import {
  type CustomFieldType,
  rootFolderId,
} from "@chatbotx.io/database/partials"
import { botFieldModel } from "@chatbotx.io/database/schema"
import type { BotFieldModel } from "@chatbotx.io/database/types"
import {
  likeContains,
  parseOrderByAsObject,
  parsePagination,
} from "@chatbotx.io/database/utils"
import { FieldOperationType } from "@chatbotx.io/flow-config"
import { withCache } from "@chatbotx.io/redis"
import { createId } from "@chatbotx.io/utils"
import {
  canonicalNumberLiteral,
  customFieldResolutionKey,
  normalizeCustomFieldName,
  pickCustomFieldRow,
  planCustomFieldResolution,
} from "@chatbotx.io/utils/custom-field"
import { isFieldOperationAllowed } from "@chatbotx.io/utils/custom-field-operation"
import {
  DEFAULT_FILTER_TIMEZONE,
  isTemporalCustomFieldType,
  SourceTimezoneStrategy,
  TemporalInputParsing,
} from "@chatbotx.io/utils/datetime"
import { calculateFieldValue } from "@chatbotx.io/utils/field-value-calculator"
import { BaseService } from "../base.service"
import {
  createSourceTimezoneResolver,
  normalizeCustomFieldValueForStorage,
  type SourceTimezoneResolver,
} from "../contact-custom-field/normalize"
import type { ResolvedCustomField } from "../custom-field/service"
import {
  ChatbotXException,
  invalidFieldOperationException,
  notFoundException,
  validationException,
} from "../errors"
import { folderService } from "../folder/service"
import {
  assertResourceEditable,
  changedKeysOf,
  withDeleteGuard,
} from "../template/installed-resource.service"
import { TEMPLATE_LOCKED_CONTENT_KEYS } from "../template/lock-policy"
import { withTemplateLockedTransaction } from "../template/template-resource-locks"
import type { PaginatedResult } from "../types"

type ListBotFieldsInput = {
  workspaceId: string
  folderId?: string | null
  name?: string | null
  page?: number | null
  perPage?: number | null
  sort?: { id: string; desc: boolean }[] | null
}

type CreateBotFieldData = {
  name: string
  type: CustomFieldType
  value?: string | null
  description?: string | null
  folderId?: string | null
}

type UpdateBotFieldData = Partial<CreateBotFieldData>

const REGEX_BOT_FIELD_ID = /^\d+$/

/** The operations that run as one atomic `UPDATE` instead of the calculator. */
type AtomicFieldOperation =
  | typeof FieldOperationType.append
  | typeof FieldOperationType.prepend
  | typeof FieldOperationType.increase
  | typeof FieldOperationType.decrease

/**
 * One parameterized Drizzle `sql` expression per atomic operation, run as a
 * single `UPDATE ... SET value = <expression>` (see
 * `applyAtomicValueOperation`). No read-modify-write: the arithmetic/string
 * concatenation happens inside Postgres, so concurrent calls (chatbot-scale
 * traffic across worker replicas) never race on a stale in-process read, and
 * every operand is a bound parameter — never string-interpolated. Every other
 * operation locks the row and goes through `calculateFieldValue`.
 */
const ATOMIC_VALUE_EXPRESSIONS: Record<
  AtomicFieldOperation,
  (value: string) => SQL
> = {
  [FieldOperationType.append]: (value) =>
    sql`concat(coalesce(${botFieldModel.value}, ''), ${value}::text)`,
  [FieldOperationType.prepend]: (value) =>
    sql`concat(${value}::text, coalesce(${botFieldModel.value}, ''))`,
  [FieldOperationType.increase]: (value) =>
    sql`(coalesce(nullif(${botFieldModel.value}, ''), '0')::numeric + ${value}::numeric)::text`,
  [FieldOperationType.decrease]: (value) =>
    sql`(coalesce(nullif(${botFieldModel.value}, ''), '0')::numeric - ${value}::numeric)::text`,
}

/**
 * Bot fields are workspace-scoped, not attached to a contact, so temporal
 * normalization always anchors to the workspace timezone (or the caller's
 * explicit override) rather than a contact's. `SourceTimezoneStrategy.Workspace`
 * resolves purely from `workspaceModel` and never reads `contactId`, so the
 * placeholder below is never actually consulted — reusing
 * `createSourceTimezoneResolver` here keeps the resolution logic (and the
 * override short-circuit) in one place instead of duplicating it.
 */
const createWorkspaceSourceTimezoneResolver = (props: {
  workspaceId: string
  sourceTimezoneOverride?: string
  /** Pass the open transaction so the lookup never waits on a second connection. */
  tx?: DatabaseClient
}): SourceTimezoneResolver =>
  createSourceTimezoneResolver({
    workspaceId: props.workspaceId,
    contactId: "",
    strategy: SourceTimezoneStrategy.Workspace,
    explicitSourceTimezone: props.sourceTimezoneOverride,
    tx: props.tx,
  })

/**
 * Exported so read-side caches outside this service (e.g. the variables
 * package's bot-field map) can subscribe to the same invalidation: every
 * write path in this service invalidates these tags.
 */
export const botFieldWorkspaceCacheTags = (workspaceId: string): string[] => [
  "bot-fields",
  `bot-fields:${workspaceId}`,
]

const botFieldCacheTags = (workspaceId: string, id: string): string[] => [
  ...botFieldWorkspaceCacheTags(workspaceId),
  `bot-fields:${workspaceId}:${id}`,
]

class BotFieldService extends BaseService {
  async list(
    input: ListBotFieldsInput,
  ): Promise<PaginatedResult<BotFieldModel>> {
    const where = {
      workspaceId: input.workspaceId,
      folderId: input.folderId
        ? // biome-ignore lint/style/noNestedTernary: allow nested ternary
          input.folderId === rootFolderId
          ? { isNull: true as const }
          : input.folderId
        : undefined,
      name: input.name ? { ilike: likeContains(input.name) } : undefined,
    }

    const orderBy = parseOrderByAsObject(botFieldModel, input)
    const pagination = parsePagination(input)

    const [data, total] = await Promise.all([
      db.query.botFieldModel.findMany({ where, orderBy, ...pagination }),
      db.$count(botFieldModel, relationsFilterToSQL(botFieldModel, where)),
    ])

    const pageCount = pagination?.limit
      ? Math.ceil(total / pagination.limit)
      : 1

    return { data, pageCount }
  }

  async find(props: {
    workspaceId: string
    id: string
    tx?: DatabaseClient
  }): Promise<BotFieldModel | undefined> {
    const { workspaceId, id, tx = db } = props
    return await withCache(
      `bot-fields:${workspaceId}:id:${id}`,
      async () =>
        await tx.query.botFieldModel.findFirst({
          where: { id, workspaceId },
        }),
      {
        dynamicTags: (result) =>
          result ? botFieldCacheTags(workspaceId, result.id) : undefined,
      },
    )
  }

  async findOrFail(props: {
    workspaceId: string
    id: string
    tx?: DatabaseClient
  }): Promise<BotFieldModel> {
    const botField = await this.find(props)
    if (!botField) {
      throw notFoundException("Bot field not found")
    }
    return botField
  }

  async findByKey(props: {
    workspaceId: string
    key: string
    tx?: DatabaseClient
  }): Promise<BotFieldModel | undefined> {
    const { workspaceId, key, tx = db } = props
    return await withCache(
      `bot-fields:${workspaceId}:key:${key}`,
      async () =>
        await tx.query.botFieldModel.findFirst({
          where: {
            [REGEX_BOT_FIELD_ID.test(key) ? "id" : "name"]: key,
            workspaceId,
          },
        }),
      {
        dynamicTags: (result) =>
          result ? botFieldCacheTags(workspaceId, result.id) : undefined,
      },
    )
  }

  async findByKeyOrFail(props: {
    workspaceId: string
    key: string
    tx?: DatabaseClient
  }): Promise<BotFieldModel> {
    const botField = await this.findByKey(props)
    if (!botField) {
      throw notFoundException("Bot field not found")
    }
    return botField
  }

  async findManyByIds(props: {
    workspaceId: string
    ids: string[]
    tx?: DatabaseClient
  }): Promise<BotFieldModel[]> {
    const { workspaceId, ids, tx = db } = props
    if (ids.length === 0) {
      return []
    }
    return await tx.query.botFieldModel.findMany({
      where: { workspaceId, id: { in: ids } },
    })
  }

  /**
   * Resolves flow/template bot-field references by `(name, type)`: a same-typed
   * field is reused, otherwise one is created. A name already used by a field
   * of ANOTHER type (or by an earlier field of this request) is created as
   * `<name>_<n>` - exactly the custom-field policy, decided by the same pure
   * planner (`planCustomFieldResolution`), under the workspace's `bf-names:`
   * lock. `{{bot_field:<id>}}` tokens address a field by id, so a rename needs
   * no token rewrite. The outcome per requested field is in `resolved`.
   */
  async resolveByNameAndType(props: {
    workspaceId: string
    fields: { name: string; type: CustomFieldType }[]
    tx?: DatabaseClient
  }): Promise<{
    idMap: Map<string, string>
    createdIds: string[]
    resolved: Map<string, ResolvedCustomField>
  }> {
    const { workspaceId, fields } = props

    const uniqueFields = Array.from(
      new Map(
        fields.map((field) => [customFieldResolutionKey(field), field]),
      ).values(),
    )
    if (uniqueFields.length === 0) {
      return { idMap: new Map(), createdIds: [], resolved: new Map() }
    }

    const resolve = async (tx: DatabaseClient) => {
      await this.lockNames(tx, workspaceId)
      return await this.resolveLocked({ workspaceId, uniqueFields, tx })
    }
    const result = props.tx
      ? await resolve(props.tx)
      : await db.transaction(resolve)

    // Whole-workspace caches (e.g. the variables package's bot-field map) cache
    // the ABSENCE of a field too, so a created row must invalidate them or a
    // template-installed flow's `{{bot_field:<newId>}}` stays unresolved.
    if (result.createdIds.length > 0) {
      await this.invalidate({ workspaceId, ids: result.createdIds })
    }
    return result
  }

  /**
   * What resolving `fields` against this workspace's bot fields does (reuse,
   * create, or create under a numbered name), without writing. The caller must
   * hold the name lock when it goes on to write.
   */
  async planResolution(props: {
    workspaceId: string
    fields: { name: string; type: CustomFieldType }[]
    tx?: DatabaseClient
  }) {
    const { workspaceId, fields, tx = db } = props
    const existing = (await tx.query.botFieldModel.findMany({
      where: { workspaceId },
      columns: { id: true, name: true, type: true },
    })) as BotFieldModel[]
    return planCustomFieldResolution(existing, fields)
  }

  private async resolveLocked(props: {
    workspaceId: string
    uniqueFields: { name: string; type: CustomFieldType }[]
    tx: DatabaseClient
  }): Promise<{
    idMap: Map<string, string>
    createdIds: string[]
    resolved: Map<string, ResolvedCustomField>
  }> {
    const { workspaceId, uniqueFields, tx } = props

    const requestedNameByKey = new Map(
      uniqueFields.map(
        (field) =>
          [customFieldResolutionKey(field), field.name.trim()] as const,
      ),
    )
    const { plans, winners } = await this.planResolution({
      workspaceId,
      fields: uniqueFields,
      tx,
    })
    const byKey = new Map<string, BotFieldModel>(winners)
    const remember = (row: BotFieldModel): void => {
      const key = customFieldResolutionKey(row)
      byKey.set(
        key,
        pickCustomFieldRow(byKey.get(key), row, requestedNameByKey.get(key)),
      )
    }

    const missing: { name: string; type: CustomFieldType }[] = []
    const plannedNameByKey = new Map<string, string>()
    for (const field of uniqueFields) {
      const requestedKey = customFieldResolutionKey(field)
      const plan = plans.get(requestedKey)
      if (plan && plan.action !== "reuse") {
        missing.push(field)
        plannedNameByKey.set(requestedKey, plan.plannedName)
      }
    }

    const createdIds: string[] = []
    let lostRace = false

    if (missing.length > 0) {
      const inserted = await tx
        .insert(botFieldModel)
        .values(
          missing.map((field) => ({
            id: createId(),
            workspaceId,
            name:
              plannedNameByKey.get(customFieldResolutionKey(field)) ??
              field.name,
            type: field.type,
          })),
        )
        .onConflictDoNothing()
        .returning()

      for (const row of inserted) {
        createdIds.push(row.id)
        remember(row)
      }
      // Rows dropped by onConflictDoNothing can't be matched by position, so
      // detect the gap by count and re-select to pick up the winners' rows.
      lostRace = inserted.length < missing.length
    }

    if (lostRace) {
      const reresolved = await tx.query.botFieldModel.findMany({
        where: { workspaceId },
        columns: { id: true, name: true, type: true },
      })
      for (const row of reresolved) {
        remember(row as BotFieldModel)
      }
    }

    const resolved = new Map<string, ResolvedCustomField>()
    for (const field of uniqueFields) {
      const requestedKey = customFieldResolutionKey(field)
      const plannedName = plannedNameByKey.get(requestedKey)
      const renamed =
        plannedName !== undefined &&
        normalizeCustomFieldName(plannedName) !==
          normalizeCustomFieldName(field.name)
      const row = byKey.get(
        plannedName === undefined
          ? requestedKey
          : customFieldResolutionKey({ name: plannedName, type: field.type }),
      )
      if (row) {
        resolved.set(requestedKey, { id: row.id, name: row.name, renamed })
      }
    }
    const idMap = new Map(
      [...resolved].map(([key, field]) => [key, field.id] as const),
    )
    return { idMap, createdIds, resolved }
  }

  /**
   * Runtime coercion for a value being written through `create`/`updateByKey`
   * (builder dialogs, the workspace-token set-one/set-many/bulk-update APIs,
   * and template install): boolean coerces (never throws), number
   * validates-or-throws, temporal normalizes against the WORKSPACE timezone
   * (bot fields have no contact to anchor to) using default Strict parsing —
   * both the `yyyy-MM-dd` and `yyyy-MM-dd HH:mm` shapes the account-fields
   * dialogs save already satisfy Strict, so this never regresses those forms.
   * `applyValueOperation`'s `set` branch does NOT go through this helper: it
   * needs the caller's `sourceTimezoneOverride`/`temporalInputParsing`/
   * `fillEmptyTemporalWithNow`, and normalizing twice would silently
   * re-anchor an already-canonical date to the workspace zone, discarding
   * the override. It normalizes directly, then writes via `persistUpdate`.
   * A patch with no `value` (undefined) or an explicit `null` (clear) is
   * returned unchanged — nothing to normalize.
   */
  private async prepareValuePatch<T extends UpdateBotFieldData>(
    workspaceId: string,
    existingType: CustomFieldType | undefined,
    data: T,
  ): Promise<T> {
    if (data.value === undefined || data.value === null) {
      return data
    }

    const type = data.type ?? existingType
    if (!type) {
      return data
    }

    const normalizedValue = await normalizeCustomFieldValueForStorage({
      type,
      value: data.value,
      resolveSourceTimezone: createWorkspaceSourceTimezoneResolver({
        workspaceId,
      }),
    })

    if (normalizedValue === null) {
      throw new ChatbotXException(
        `Invalid ${type} value for bot field`,
        "invalidFieldOperation",
      )
    }

    return { ...data, value: normalizedValue }
  }

  /**
   * Shared write primitive behind `updateByKey` and `applyValueOperation`'s
   * `set` branch: persists an ALREADY-normalized patch and invalidates the
   * cache. Kept separate from `updateByKey` so `applyValueOperation` can
   * write its own (differently-normalized) value without running
   * `prepareValuePatch` a second time — see that method's doc comment.
   */
  private async persistUpdate(props: {
    workspaceId: string
    existing: BotFieldModel
    data: UpdateBotFieldData
    /** A caller-owned transaction; absent, a locked one is opened here. */
    tx?: DatabaseClient
    /** The caller invalidates after its own transaction commits. */
    deferInvalidation?: boolean
  }): Promise<BotFieldModel> {
    const { workspaceId, existing, data, tx, deferInvalidation } = props
    if (tx) {
      const updated = await this.writeUpdate({
        workspaceId,
        existing,
        data,
        tx,
      })
      if (!deferInvalidation) {
        await this.invalidate({ workspaceId, ids: [existing.id] })
      }
      return updated
    }
    // A bare `db` would release the advisory lock at statement end, so the
    // guard and the write run in one locked transaction; the cache is dropped
    // after it commits. The field's lock is taken before the stored row is
    // re-read, so the diff that decides the guard is computed under the lock.
    const updated = await withTemplateLockedTransaction(
      (lockedTx) =>
        this.writeUpdate({ workspaceId, existing, data, tx: lockedTx }),
      {
        workspaceId,
        initialKeys: this.touchesLockedContent(data)
          ? [{ kind: "botField", resourceId: existing.id }]
          : [],
      },
    )
    await this.invalidate({ workspaceId, ids: [existing.id] })
    return updated
  }

  /** A patch with none of the kind's content keys can never trip the guard, so it needs neither the lock nor a re-read. */
  private touchesLockedContent(data: UpdateBotFieldData): boolean {
    return Object.keys(data).some((key) =>
      TEMPLATE_LOCKED_CONTENT_KEYS.botField.includes(key),
    )
  }

  private async writeUpdate(props: {
    workspaceId: string
    existing: BotFieldModel
    data: UpdateBotFieldData
    tx: DatabaseClient
  }): Promise<BotFieldModel> {
    const { workspaceId, data, tx } = props

    // The row the caller read may predate a sync's write; the diff is taken
    // against the row as it stands now, inside the transaction.
    const existing = this.touchesLockedContent(data)
      ? await this.reloadForUpdate({ workspaceId, id: props.existing.id, tx })
      : props.existing

    await assertResourceEditable({
      workspaceId,
      resourceKind: "botField",
      resourceIds: [existing.id],
      changedKeys: changedKeysOf(existing, data),
      tx,
    })

    if (data.folderId && data.folderId !== existing.folderId) {
      await folderService.ensureExists({
        id: data.folderId,
        workspaceId,
        folderType: "customField",
        tx,
      })
    }

    if (data.name !== undefined) {
      await this.lockNames(tx, workspaceId)
    }
    try {
      const [updated] = await tx
        .update(botFieldModel)
        .set(data)
        .where(eq(botFieldModel.id, existing.id))
        .returning()
      return updated
    } catch (error) {
      if (isUniqueViolationError(error)) {
        throw validationException("name", "Name is already taken")
      }
      throw error
    }
  }

  private async reloadForUpdate(props: {
    workspaceId: string
    id: string
    tx: DatabaseClient
  }): Promise<BotFieldModel> {
    const row = await props.tx.query.botFieldModel.findFirst({
      where: { workspaceId: props.workspaceId, id: props.id },
    })
    if (!row) {
      throw notFoundException("Bot field not found")
    }
    return row
  }

  /**
   * Serializes every bot-field name write of one workspace (transaction-scoped,
   * held until the surrounding transaction commits), so a template install that
   * looked a name up can create it without a concurrent writer taking it first.
   * Same pattern as the custom-field `cf-names:` lock.
   */
  async lockNames(tx: DatabaseClient, workspaceId: string): Promise<void> {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`bf-names:${workspaceId}`}, 0))`,
    )
  }

  /** The bot field with exactly this `(name, type)`, the pair the unique index keys on. */
  async findByNameAndType(props: {
    workspaceId: string
    name: string
    type: CustomFieldType
    tx?: DatabaseClient
  }): Promise<BotFieldModel | undefined> {
    const { workspaceId, name, type, tx = db } = props
    return await tx.query.botFieldModel.findFirst({
      where: { workspaceId, name, type },
    })
  }

  async create(props: {
    workspaceId: string
    data: CreateBotFieldData
    tx?: DatabaseClient
  }): Promise<BotFieldModel> {
    const { workspaceId, data, tx = db } = props

    // On the caller's transaction: a template install creates the folder in
    // the same, still uncommitted, transaction.
    if (data.folderId) {
      await folderService.ensureExists({
        id: data.folderId,
        workspaceId,
        folderType: "customField",
        tx,
      })
    }

    const preparedData = await this.prepareValuePatch(
      workspaceId,
      data.type,
      data,
    )

    await this.lockNames(tx, workspaceId)
    let botField: BotFieldModel
    try {
      ;[botField] = await tx
        .insert(botFieldModel)
        .values({ id: createId(), workspaceId, ...preparedData })
        .returning()
    } catch (error) {
      if (isUniqueViolationError(error)) {
        throw validationException("name", "Name is already taken")
      }
      throw error
    }

    await this.invalidate({ workspaceId })
    return botField
  }

  async updateByKey(props: {
    workspaceId: string
    key: string
    data: UpdateBotFieldData
    tx?: DatabaseClient
  }): Promise<BotFieldModel> {
    const { workspaceId, key, data, tx } = props
    const existing = await this.findByKeyOrFail({ workspaceId, key, tx })

    const preparedData = await this.prepareValuePatch(
      workspaceId,
      existing.type,
      data,
    )

    return await this.persistUpdate({
      workspaceId,
      existing,
      data: preparedData,
      tx,
    })
  }

  /**
   * Applies one of the five `FieldOperationType` value operations to a bot
   * field, enforcing the operation x type policy in `OPERATION_ALLOWED_TYPES`.
   * `set` normalizes the value itself (full timezone-override support) and
   * writes through the shared `persistUpdate` primitive — NOT `updateByKey`,
   * which would re-run `prepareValuePatch` against the workspace zone and
   * silently discard the caller's override (see `prepareValuePatch`'s doc
   * comment). Every other operation runs as a single atomic Drizzle UPDATE
   * (see `applyAtomicValueOperation`) so concurrent callers never race on a
   * stale read.
   */
  async applyValueOperation(props: {
    workspaceId: string
    key: string
    operation: FieldOperationType
    value: string
    sourceTimezoneOverride?: string
    /** Strict (default) or Lenient multi-format parsing for temporal input. */
    temporalInputParsing?: TemporalInputParsing
    /** Blank temporal value -> stamp "now" in the resolved source zone. */
    fillEmptyTemporalWithNow?: boolean
  }): Promise<BotFieldModel> {
    const {
      workspaceId,
      key,
      operation,
      value,
      sourceTimezoneOverride,
      temporalInputParsing,
      fillEmptyTemporalWithNow,
    } = props
    const existing = await this.findByKeyOrFail({ workspaceId, key })

    if (!isFieldOperationAllowed(operation, existing.type)) {
      throw new ChatbotXException(
        `Operation "${operation}" is not supported for field type "${existing.type}"`,
        "invalidFieldOperation",
      )
    }

    if (operation === FieldOperationType.set) {
      const normalizedValue = await normalizeCustomFieldValueForStorage({
        type: existing.type,
        value,
        resolveSourceTimezone: createWorkspaceSourceTimezoneResolver({
          workspaceId,
          sourceTimezoneOverride,
        }),
        explicitTimezone: sourceTimezoneOverride,
        temporalInputParsing,
        fillEmptyTemporalWithNow,
      })

      if (normalizedValue === null) {
        throw new ChatbotXException(
          `Invalid ${existing.type} value for bot field`,
          "invalidFieldOperation",
        )
      }

      return await this.persistUpdate({
        workspaceId,
        existing,
        data: { value: normalizedValue },
      })
    }

    if (Object.hasOwn(ATOMIC_VALUE_EXPRESSIONS, operation)) {
      return await this.applyAtomicValueOperation({
        workspaceId,
        id: existing.id,
        operation: operation as AtomicFieldOperation,
        value,
      })
    }

    return await this.applyCalculatedOperation({
      workspaceId,
      id: existing.id,
      operation,
      value,
      sourceTimezoneOverride,
    })
  }

  /**
   * Clear, formula and date operations: lock the row, calculate against the
   * value read under the lock, then persist. Rejections surface as a typed
   * `invalidFieldOperation` carrying the machine-readable reason.
   */
  private async applyCalculatedOperation(props: {
    workspaceId: string
    id: string
    operation: FieldOperationType
    value: string
    sourceTimezoneOverride?: string
  }): Promise<BotFieldModel> {
    const { workspaceId, id, operation, value, sourceTimezoneOverride } = props
    // The template locks come first, as on every other write: the row lock
    // below, then the edit guard's advisory lock, would invert that order
    // against a concurrent rename of an installed field and deadlock.
    const updated = await withTemplateLockedTransaction(
      async (tx) => {
        const resolveSourceTimezone = createWorkspaceSourceTimezoneResolver({
          workspaceId,
          sourceTimezoneOverride,
          tx,
        })
        const [locked] = await tx
          .select()
          .from(botFieldModel)
          .where(
            and(
              eq(botFieldModel.workspaceId, workspaceId),
              eq(botFieldModel.id, id),
            ),
          )
          .for("update")
        if (!locked) {
          throw notFoundException("Bot field not found")
        }

        const timeZone = isTemporalCustomFieldType(locked.type)
          ? await resolveSourceTimezone()
          : DEFAULT_FILTER_TIMEZONE
        const result = calculateFieldValue({
          fieldType: locked.type,
          operation,
          currentValue: locked.value,
          operand: value,
          clock: { now: new Date(), timeZone },
        })
        if (result.kind === "rejected") {
          throw invalidFieldOperationException(result.reason)
        }
        if (result.kind === "unchanged") {
          return locked
        }

        const normalizedValue =
          result.kind === "clear"
            ? null
            : await normalizeCustomFieldValueForStorage({
                type: locked.type,
                value: result.value,
                resolveSourceTimezone,
                explicitTimezone: timeZone,
                temporalInputParsing: TemporalInputParsing.Strict,
              })
        if (result.kind === "set" && normalizedValue === null) {
          throw new ChatbotXException(
            `Invalid ${locked.type} value for bot field`,
            "invalidFieldOperation",
          )
        }
        return await this.persistUpdate({
          workspaceId,
          existing: locked,
          data: { value: normalizedValue },
          tx,
          // Invalidating inside the transaction lets a concurrent read re-cache
          // the old value before the commit; do it once the write is visible.
          deferInvalidation: true,
        })
      },
      { workspaceId, initialKeys: [{ kind: "botField", resourceId: id }] },
    )

    await this.invalidate({ workspaceId, ids: [id] })
    return updated
  }

  /**
   * The append/prepend/increase/decrease branch of `applyValueOperation`: a
   * single parameterized `UPDATE ... RETURNING` so the read-and-mutate happens
   * inside Postgres, never in application memory. A non-numeric historical
   * value under increase/decrease fails the `::numeric` cast — caught and
   * rethrown as a predictable business exception instead of a raw DB error.
   */
  private async applyAtomicValueOperation(props: {
    workspaceId: string
    id: string
    operation: AtomicFieldOperation
    value: string
  }): Promise<BotFieldModel> {
    const { workspaceId, id, operation, value } = props
    const isNumericOperation =
      operation === FieldOperationType.increase ||
      operation === FieldOperationType.decrease

    // Validate the OPERAND before touching the DB, so a bad operand fails
    // predictably (typed error) instead of surfacing as a PG cast error
    // indistinguishable from a bad HISTORICAL value (handled below). Uses
    // `canonicalNumberLiteral` directly (not the un-trimmed `normalizeNumber`)
    // so a whitespace-padded operand (" 1.5 ") from free-text writes matches
    // the `set` path's trimming behavior. The canonical form (e.g. "007" ->
    // "7", " 1.5 " -> "1.5") is what actually reaches the SQL.
    let operand = value
    if (isNumericOperation) {
      const canonicalOperand = canonicalNumberLiteral(value)
      if (canonicalOperand === null) {
        throw new ChatbotXException(
          `"${value}" is not a valid number value for this field.`,
          "invalidFieldOperation",
        )
      }
      operand = canonicalOperand
    }

    let rows: BotFieldModel[]
    try {
      rows = await db
        .update(botFieldModel)
        .set({ value: ATOMIC_VALUE_EXPRESSIONS[operation](operand) })
        .where(
          and(
            eq(botFieldModel.workspaceId, workspaceId),
            eq(botFieldModel.id, id),
          ),
        )
        .returning()
    } catch (error: unknown) {
      if (isNumericOperation) {
        throw new ChatbotXException(
          "Bot field value is not numeric and cannot be increased or decreased",
          "invalidFieldOperation",
        )
      }
      throw error
    }

    const [updated] = rows
    if (!updated) {
      throw notFoundException("Bot field not found")
    }

    await this.invalidate({ workspaceId, ids: [id] })

    return updated
  }

  /**
   * Nulls a bot field's value without deleting the row (row deletion stays a
   * separate admin API via `deleteByKey`/`bulkDelete`).
   */
  async clearValueByKey(props: {
    workspaceId: string
    key: string
    tx?: DatabaseClient
  }): Promise<BotFieldModel> {
    const { workspaceId, key, tx = db } = props
    const existing = await this.findByKeyOrFail({ workspaceId, key, tx })

    const [updated] = await tx
      .update(botFieldModel)
      .set({ value: null })
      .where(
        and(
          eq(botFieldModel.workspaceId, workspaceId),
          eq(botFieldModel.id, existing.id),
        ),
      )
      .returning()

    // A concurrent delete between `findByKeyOrFail` and this UPDATE leaves no
    // row to return — surface it as notFound instead of returning `undefined`
    // as if the clear succeeded.
    if (!updated) {
      throw notFoundException("Bot field not found")
    }

    await this.invalidate({ workspaceId, ids: [existing.id] })

    return updated
  }

  /**
   * Nulls the values of multiple bot fields without deleting the rows —
   * the bulk (by-id) counterpart of `clearValueByKey`.
   */
  async bulkClearValues(props: {
    workspaceId: string
    ids: string[]
    tx?: DatabaseClient
  }): Promise<void> {
    const { workspaceId, ids, tx = db } = props
    if (ids.length === 0) {
      return
    }

    await tx
      .update(botFieldModel)
      .set({ value: null })
      .where(
        and(
          eq(botFieldModel.workspaceId, workspaceId),
          inArray(botFieldModel.id, ids),
        ),
      )

    await this.invalidate({ workspaceId, ids })
  }

  async bulkUpdateByKeys(props: {
    workspaceId: string
    updates: Array<{ key: string; value: string }>
  }): Promise<void> {
    await Promise.all(
      props.updates.map(({ key, value }) =>
        this.updateByKey({
          workspaceId: props.workspaceId,
          key,
          data: { value },
        }),
      ),
    )
  }

  async deleteByKey(props: {
    workspaceId: string
    key: string
  }): Promise<void> {
    const botField = await this.findByKeyOrFail({
      workspaceId: props.workspaceId,
      key: props.key,
    })

    await this.bulkDelete({
      workspaceId: props.workspaceId,
      ids: [botField.id],
    })
  }

  async bulkDelete(props: {
    workspaceId: string
    ids: string[]
    tx?: DatabaseClient
  }): Promise<void> {
    const { workspaceId, ids } = props

    await withDeleteGuard(
      {
        workspaceId,
        targets: [{ resourceKind: "botField", resourceIds: ids }],
        tx: props.tx,
      },
      (tx) =>
        tx
          .delete(botFieldModel)
          .where(
            and(
              eq(botFieldModel.workspaceId, workspaceId),
              inArray(botFieldModel.id, ids),
            ),
          ),
    )

    await this.invalidate({ workspaceId, ids })
  }

  async invalidate(props: {
    workspaceId: string
    ids?: string[]
  }): Promise<void> {
    const tags = [
      ...botFieldWorkspaceCacheTags(props.workspaceId),
      ...(props.ids?.map((id) => `bot-fields:${props.workspaceId}:${id}`) ??
        []),
    ]
    await this.invalidateCacheTags(tags)
  }
}

export const botFieldService = new BotFieldService()
