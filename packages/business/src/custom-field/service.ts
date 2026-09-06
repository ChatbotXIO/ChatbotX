import {
  and,
  type DatabaseClient,
  db,
  eq,
  inArray,
  isDatabaseError,
  type RelationsFieldFilter,
  relationsFilterToSQL,
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
import { customFieldResolutionKey } from "@chatbotx.io/utils/custom-field"
import { BaseService } from "../base.service"
import { notFoundException, validationException } from "../errors"
import { folderService } from "../folder/service"
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
  }): Promise<{ idMap: Map<string, string>; createdIds: string[] }> {
    const { workspaceId, fields, tx = db } = props

    const uniqueFields = Array.from(
      new Map(
        fields.map((field) => [customFieldResolutionKey(field), field]),
      ).values(),
    )
    if (uniqueFields.length === 0) {
      return { idMap: new Map(), createdIds: [] }
    }

    // Requested names, keyed the same way, so a folded collision can be
    // broken by "does this row match the requested casing exactly?".
    const requestedNameByKey = new Map(
      uniqueFields.map(
        (field) =>
          [customFieldResolutionKey(field), field.name.trim()] as const,
      ),
    )

    const byKey = new Map<string, CustomFieldModel>()
    /**
     * Deterministic winner between two rows folding to the same key: exact
     * (trimmed) name match beats a case-only match; otherwise the lowest id
     * — the oldest row — wins. Without this the last row of an unordered
     * `findMany` would win and the mapping would drift between runs.
     */
    const pickBetter = (
      current: CustomFieldModel | undefined,
      candidate: CustomFieldModel,
      key: string,
    ): CustomFieldModel => {
      if (!current) {
        return candidate
      }
      const requested = requestedNameByKey.get(key)
      if (requested !== undefined) {
        const currentExact = current.name.trim() === requested
        const candidateExact = candidate.name.trim() === requested
        if (currentExact !== candidateExact) {
          return candidateExact ? candidate : current
        }
      }
      return candidate.id < current.id ? candidate : current
    }
    const remember = (row: CustomFieldModel): void => {
      const key = customFieldResolutionKey(row)
      byKey.set(key, pickBetter(byKey.get(key), row, key))
    }

    const existing = await tx.query.customFieldModel.findMany({
      where: { workspaceId },
      columns: { id: true, name: true, type: true },
    })
    for (const row of existing) {
      remember(row as CustomFieldModel)
    }

    const missing = uniqueFields.filter(
      (field) => !byKey.has(customFieldResolutionKey(field)),
    )
    const createdIds: string[] = []
    let lostRace = false

    if (missing.length > 0) {
      const inserted = await tx
        .insert(customFieldModel)
        .values(
          missing.map((field) => ({
            id: createId(),
            workspaceId,
            name: field.name,
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

    const idMap = new Map(
      uniqueFields.flatMap((field) => {
        const key = customFieldResolutionKey(field)
        const row = byKey.get(key)
        return row ? [[key, row.id] as const] : []
      }),
    )

    return { idMap, createdIds }
  }

  async create(props: {
    workspaceId: string
    data: CreateCustomFieldData
    tx?: DatabaseClient
  }): Promise<CustomFieldModel> {
    const { workspaceId, data, tx = db } = props

    if (data.folderId) {
      await folderService.ensureExists({
        id: data.folderId,
        workspaceId,
        folderType: "customField",
      })
    }

    try {
      const [field] = await tx
        .insert(customFieldModel)
        .values({ id: createId(), workspaceId, showInInbox: true, ...data })
        .returning()
      await this.invalidate({ workspaceId })
      return field
    } catch (error) {
      if (isDatabaseError(error) && error.cause.code === "23505") {
        throw validationException("name", "Name is already taken")
      }
      throw error
    }
  }

  async update(
    ctx: { workspaceId: string; id: string },
    data: UpdateCustomFieldData,
    tx: DatabaseClient = db,
  ): Promise<CustomFieldModel> {
    const existing = await this.findByKeyOrFail({
      workspaceId: ctx.workspaceId,
      key: ctx.id,
      tx,
    })

    if (data.folderId && data.folderId !== existing.folderId) {
      await folderService.ensureExists({
        id: data.folderId,
        workspaceId: ctx.workspaceId,
        folderType: "customField",
      })
    }

    const [updated] = await tx
      .update(customFieldModel)
      .set(data)
      .where(eq(customFieldModel.id, existing.id))
      .returning()

    await this.invalidate({ workspaceId: ctx.workspaceId, ids: [existing.id] })
    return updated
  }

  async delete(props: {
    workspaceId: string
    ids: string[]
    tx?: DatabaseClient
  }): Promise<void> {
    const { workspaceId, ids, tx = db } = props

    await tx
      .delete(customFieldModel)
      .where(
        and(
          eq(customFieldModel.workspaceId, workspaceId),
          inArray(customFieldModel.id, ids),
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
