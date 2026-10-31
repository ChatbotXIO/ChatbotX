import {
  and,
  type DatabaseClient,
  db,
  eq,
  inArray,
  isDatabaseError,
  type RelationsFieldFilter,
  relationsFilterToSQL,
  sql,
} from "@chatbotx.io/database/client"
import {
  type CustomFieldType,
  rootFolderId,
} from "@chatbotx.io/database/partials"
import { customFieldModel } from "@chatbotx.io/database/schema"
import type { CustomFieldModel } from "@chatbotx.io/database/types"
import {
  likeContains,
  parseOrderByAsObject,
  parsePagination,
} from "@chatbotx.io/database/utils"
import { withCache } from "@chatbotx.io/redis"
import { createId, isNumericId } from "@chatbotx.io/utils"
import {
  customFieldResolutionKey,
  normalizeCustomFieldName,
  pickCustomFieldRow,
  planCustomFieldResolution,
} from "@chatbotx.io/utils/custom-field"
import { BaseService } from "../base.service"
import { notFoundException, validationException } from "../errors"
import { folderService, toStoredFolderId } from "../folder/service"
import {
  assertResourceEditable,
  changedKeysOf,
  withDeleteGuard,
} from "../template/installed-resource.service"
import { withTemplateLockedTransaction } from "../template/template-resource-locks"
import type { PaginatedResult } from "../types"

type ListCustomFieldsInput = {
  workspaceId: string
  folderId?: string | null
  name?: string | null
  page?: number | null
  perPage?: number | null
  sort?: { id: string; desc: boolean }[] | null
}

type CreateCustomFieldData = {
  name: string
  type: CustomFieldType
  description?: string | null
  folderId?: string | null
}

type UpdateCustomFieldData = Partial<CreateCustomFieldData>

/**
 * Serializes every custom-field name write of one workspace. The DB's unique
 * index is on `(workspaceId, type, name)` — it cannot stop two writers from
 * claiming the same case-folded name under different types, which is the
 * collision `{{name}}` cannot tell apart. The lock is transaction-scoped, so it
 * is held until the surrounding transaction commits.
 */
const lockCustomFieldNames = async (
  tx: DatabaseClient,
  workspaceId: string,
): Promise<void> => {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`cf-names:${workspaceId}`}, 0))`,
  )
}

/** Runs `write` inside a transaction that holds the name lock, opening one when the caller has none. */
const withCustomFieldNameLock = async <T>(
  tx: DatabaseClient | undefined,
  workspaceId: string,
  write: (client: DatabaseClient) => Promise<T>,
): Promise<T> => {
  const locked = async (client: DatabaseClient): Promise<T> => {
    await lockCustomFieldNames(client, workspaceId)
    return await write(client)
  }
  return tx ? await locked(tx) : await db.transaction(locked)
}

export type ResolvedCustomField = {
  id: string
  /** The target row's exact stored name — what `{{name}}` must say. */
  name: string
  /** True when the requested name was taken by a field of another type. */
  renamed: boolean
}

class CustomFieldService extends BaseService {
  async list(
    input: ListCustomFieldsInput,
  ): Promise<PaginatedResult<CustomFieldModel>> {
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

    const orderBy = parseOrderByAsObject(customFieldModel, input)
    const pagination = parsePagination(input)

    const [data, total] = await Promise.all([
      db.query.customFieldModel.findMany({ where, orderBy, ...pagination }),
      db.$count(
        customFieldModel,
        relationsFilterToSQL(customFieldModel, where),
      ),
    ])

    const pageCount = pagination?.limit
      ? Math.ceil(total / pagination.limit)
      : 1

    return { data, pageCount }
  }

  async findByKey(props: {
    workspaceId: string
    key: string
    tx?: DatabaseClient
  }): Promise<CustomFieldModel | undefined> {
    const { workspaceId, key, tx = db } = props
    return await withCache(
      `custom-fields:${workspaceId}:key:${key}`,
      async () => {
        if (isNumericId(key)) {
          const byId = await tx.query.customFieldModel.findFirst({
            where: { id: key, workspaceId },
          })
          if (byId) {
            return byId
          }
        }
        return await tx.query.customFieldModel.findFirst({
          where: { name: key, workspaceId },
        })
      },
      {
        dynamicTags: (result) =>
          result
            ? [
                "custom-fields",
                `custom-fields:${workspaceId}`,
                `custom-fields:${workspaceId}:${result.id}`,
              ]
            : undefined,
      },
    )
  }

  async findByKeyOrFail(props: {
    workspaceId: string
    key: string
    tx?: DatabaseClient
  }): Promise<CustomFieldModel> {
    const field = await this.findByKey(props)
    if (!field) {
      throw notFoundException("Custom field not found")
    }
    return field
  }

  async findBy(props: {
    where: Partial<{
      id?: RelationsFieldFilter<string>
      workspaceId?: RelationsFieldFilter<string>
      name?: RelationsFieldFilter<string>
    }>
    tx?: DatabaseClient
  }): Promise<CustomFieldModel | undefined> {
    const { tx = db, where } = props
    return await tx.query.customFieldModel.findFirst({ where })
  }

  /**
   * Batched lookup for export: ids come from the exported flow graph, which is
   * untrusted input, so `workspaceId` is required alongside `inArray(id, ids)`
   * — without it a stale or planted id could leak another workspace's field
   * name. Ids that don't resolve (already-deleted fields) are simply absent
   * from the result; callers must not treat that as an error.
   */
  async findManyByIds(props: {
    workspaceId: string
    ids: string[]
    tx?: DatabaseClient
  }): Promise<CustomFieldModel[]> {
    const { workspaceId, ids, tx = db } = props
    if (ids.length === 0) {
      return []
    }
    return await tx.query.customFieldModel.findMany({
      where: { workspaceId, id: { in: ids } },
    })
  }

  /**
   * Resolves flow-import custom-field references by `(name, type)` — the same
   * pair the unique index keys on, so it disambiguates same-name fields of
   * different types instead of colliding them. Matching is case-insensitive
   * and folded in JS (mirrors `productCategoryService.resolveByNames`):
   * an exact-case DB match would create a duplicate on every casing drift.
   *
   * `CustomField_workspaceId_type_name_key` is a plain (case-sensitive) btree
   * index, so `"Email"` and `"email"` can legitimately coexist in one
   * workspace and both fold to the same key here. `findMany` has no
   * `ORDER BY`, so picking "whichever row folds last" would remap an imported
   * flow to an arbitrary one of them, differently across runs. `pickBetter`
   * therefore resolves collisions deterministically: an exact-case name match
   * always wins, and otherwise the lowest id (oldest row) does.
   *
   * Creation is a single bulk insert (avoids one round-trip per missing
   * field) and idempotent via `onConflictDoNothing` + re-select, so two
   * concurrent imports resolving the same (name, type) both land on the same
   * row instead of one violating `CustomField_workspaceId_type_name_key`.
   * `onConflictDoNothing()` is deliberately left untargeted: `CustomField`
   * has exactly one unique constraint today, so "any conflict" and "that
   * constraint" are equivalent — if a second unique constraint is ever added
   * to this table, this call will start silently swallowing conflicts on it
   * too, so revisit this if that happens.
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

    return await withCustomFieldNameLock(props.tx, workspaceId, (tx) =>
      this.resolveLocked({ workspaceId, uniqueFields, tx }),
    )
  }

  /**
   * The body of `resolveByNameAndType`, run with the workspace's name lock
   * held. A missing field whose case-folded name is already used by a field of
   * ANOTHER type is created as `<name>_<n>` (never as a second field sharing
   * the name, which `{{name}}` could not tell apart); the caller learns the
   * outcome from `resolved`, keyed by the requested field's resolution key.
   */
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

    // Requested names, keyed the same way, so a folded collision can be
    // broken by "does this row match the requested casing exactly?".
    const requestedNameByKey = new Map(
      uniqueFields.map(
        (field) =>
          [customFieldResolutionKey(field), field.name.trim()] as const,
      ),
    )

    const existing = (await tx.query.customFieldModel.findMany({
      where: { workspaceId },
      columns: { id: true, name: true, type: true },
    })) as CustomFieldModel[]
    // What to reuse, create and rename is decided by one pure function the
    // install preview shares, so the preview cannot predict something else.
    const { plans, winners } = planCustomFieldResolution(existing, uniqueFields)
    const byKey = new Map<string, CustomFieldModel>(winners)
    const remember = (row: CustomFieldModel): void => {
      const key = customFieldResolutionKey(row)
      byKey.set(
        key,
        pickCustomFieldRow(byKey.get(key), row, requestedNameByKey.get(key)),
      )
    }

    const missing: { name: string; type: CustomFieldType }[] = []
    // Requested key -> the name the row will actually be created with.
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
        .insert(customFieldModel)
        .values(
          missing.map((field) => ({
            id: createId(),
            workspaceId,
            name:
              plannedNameByKey.get(customFieldResolutionKey(field)) ??
              field.name,
            type: field.type,
            showInInbox: true,
          })),
        )
        .onConflictDoNothing()
        .returning()

      for (const row of inserted) {
        createdIds.push(row.id)
        remember(row)
      }
      // Rows dropped by onConflictDoNothing (a concurrent import won the
      // race) can't be matched by array position — returning() doesn't
      // preserve input order or cardinality on partial conflict — so detect
      // the gap by count and re-select below to pick up the winners' rows.
      lostRace = inserted.length < missing.length
    }

    if (lostRace) {
      const reresolved = await tx.query.customFieldModel.findMany({
        where: { workspaceId },
        columns: { id: true, name: true, type: true },
      })
      for (const row of reresolved) {
        remember(row as CustomFieldModel)
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

  async create(props: {
    workspaceId: string
    data: CreateCustomFieldData
    tx?: DatabaseClient
  }): Promise<CustomFieldModel> {
    const { workspaceId } = props
    const data = {
      ...props.data,
      folderId: toStoredFolderId(props.data.folderId),
    }

    if (data.folderId) {
      await folderService.ensureExists({
        id: data.folderId,
        workspaceId,
        folderType: "customField",
      })
    }

    const field = await withCustomFieldNameLock(
      props.tx,
      workspaceId,
      async (client) => {
        try {
          const [row] = await client
            .insert(customFieldModel)
            .values({ id: createId(), workspaceId, showInInbox: true, ...data })
            .returning()
          return row
        } catch (error) {
          if (isDatabaseError(error) && error.cause.code === "23505") {
            throw validationException("name", "Name is already taken")
          }
          throw error
        }
      },
    )
    // After the write commits: invalidating inside the transaction would let a
    // concurrent read re-cache the list without the new field.
    await this.invalidate({ workspaceId })
    return field
  }

  async update(
    ctx: { workspaceId: string; id: string },
    input: UpdateCustomFieldData,
    tx?: DatabaseClient,
  ): Promise<CustomFieldModel> {
    // The key may be a name, so it is resolved to the stable id first; that
    // read only names the row. The row's lock is then taken before the stored
    // row is read AGAIN inside the transaction, so the diff behind the guard
    // is computed under the lock and a racing sync's write is never reverted.
    const resolved = await this.findByKeyOrFail({
      workspaceId: ctx.workspaceId,
      key: ctx.id,
      tx,
    })
    // Without a caller transaction the guard still needs one: the template
    // lock must be held until the write commits, so a racing sync waits.
    const updated = tx
      ? await this.applyUpdate(ctx.workspaceId, resolved.id, input, tx)
      : await withTemplateLockedTransaction(
          (lockedTx) =>
            this.applyUpdate(ctx.workspaceId, resolved.id, input, lockedTx),
          {
            workspaceId: ctx.workspaceId,
            initialKeys: [{ kind: "customField", resourceId: resolved.id }],
          },
        )
    await this.invalidate({ workspaceId: ctx.workspaceId, ids: [updated.id] })
    return updated
  }

  private async applyUpdate(
    workspaceId: string,
    id: string,
    input: UpdateCustomFieldData,
    tx: DatabaseClient,
  ): Promise<CustomFieldModel> {
    // `folderId` omitted keeps the folder; null or rootFolderId means the root.
    const data =
      input.folderId === undefined
        ? input
        : { ...input, folderId: toStoredFolderId(input.folderId) }
    // Uncached, on the locked transaction: `findByKey` may serve a cached row
    // that predates a sync's write.
    const existing = await tx.query.customFieldModel.findFirst({
      where: { id, workspaceId },
    })
    if (!existing) {
      throw notFoundException("Custom field not found")
    }

    if (data.folderId && data.folderId !== existing.folderId) {
      await folderService.ensureExists({
        id: data.folderId,
        workspaceId,
        folderType: "customField",
      })
    }

    const write = async (client: DatabaseClient): Promise<CustomFieldModel> => {
      try {
        const [row] = await client
          .update(customFieldModel)
          .set(data)
          .where(eq(customFieldModel.id, existing.id))
          .returning()
        return row
      } catch (error) {
        if (isDatabaseError(error) && error.cause.code === "23505") {
          throw validationException("name", "Name is already taken")
        }
        throw error
      }
    }
    // Only a write that can change the field's name or type needs the name
    // lock; a folder move or an inbox toggle must not queue behind installs.
    const changesName = "name" in data || "type" in data
    // Any content field (a description-only update too) is guarded; a folder
    // move or inbox toggle touches none and costs no query.
    await assertResourceEditable({
      workspaceId,
      resourceKind: "customField",
      resourceIds: [existing.id],
      changedKeys: changedKeysOf(existing, data),
      tx,
    })
    return changesName
      ? await withCustomFieldNameLock(tx, workspaceId, write)
      : await write(tx)
  }

  async delete(props: {
    workspaceId: string
    ids: string[]
    tx?: DatabaseClient
  }): Promise<void> {
    const { workspaceId, ids } = props

    await withDeleteGuard(
      {
        workspaceId,
        targets: [{ resourceKind: "customField", resourceIds: ids }],
        tx: props.tx,
      },
      (tx) =>
        tx
          .delete(customFieldModel)
          .where(
            and(
              eq(customFieldModel.workspaceId, workspaceId),
              inArray(customFieldModel.id, ids),
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
      "custom-fields",
      `custom-fields:${props.workspaceId}`,
      ...(props.ids?.map((id) => `custom-fields:${props.workspaceId}:${id}`) ??
        []),
    ]
    await this.invalidateCacheTags(tags)
  }
}

export const customFieldService = new CustomFieldService()
