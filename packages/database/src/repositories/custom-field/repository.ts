import { createId, isNumericId } from "@chatbotx.io/utils"
import { customFieldResolutionKey } from "@chatbotx.io/utils/custom-field"
import {
  and,
  type DatabaseClient,
  db,
  eq,
  inArray,
  relationsFilterToSQL,
} from "../../client"
import type { CustomFieldType } from "../../partials"
import { rootFolderId } from "../../partials"
import { customFieldModel } from "../../schema"
import type { CustomFieldModel } from "../../types"
import {
  likeContains,
  parseOrderByAsObject,
  parsePagination,
} from "../../utils"

export type ListCustomFieldsParams = {
  workspaceId: string
  folderId?: string | null
  name?: string | null
  page?: number | null
  perPage?: number | null
  sort?: { id: string; desc: boolean }[] | null
}

export type ListCustomFieldsResult = {
  data: CustomFieldModel[]
  pageCount: number
}

export type CreateCustomFieldParams = {
  workspaceId: string
  name: string
  type: CustomFieldType
  description?: string | null
  folderId?: string | null
}

export type UpdateCustomFieldParams = Partial<
  Omit<CreateCustomFieldParams, "workspaceId">
>

class CustomFieldRepository {
  async list(
    params: ListCustomFieldsParams,
    tx: DatabaseClient = db,
  ): Promise<ListCustomFieldsResult> {
    const where = {
      workspaceId: params.workspaceId,
      folderId: params.folderId
        ? // biome-ignore lint/style/noNestedTernary: allow nested ternary
          params.folderId === rootFolderId
          ? { isNull: true as const }
          : params.folderId
        : undefined,
      name: params.name ? { ilike: likeContains(params.name) } : undefined,
    }

    const orderBy = parseOrderByAsObject(customFieldModel, params)
    const pagination = parsePagination(params)

    const [data, total] = await Promise.all([
      tx.query.customFieldModel.findMany({ where, orderBy, ...pagination }),
      tx.$count(
        customFieldModel,
        relationsFilterToSQL(customFieldModel, where),
      ),
    ])

    const pageCount = pagination?.limit
      ? Math.ceil(total / pagination.limit)
      : 1

    return { data, pageCount }
  }

  async findByKey(
    props: { workspaceId: string; key: string },
    tx: DatabaseClient = db,
  ): Promise<CustomFieldModel | undefined> {
    const { workspaceId, key } = props
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
  }

  async findBy(
    props: {
      where: Partial<{
        id?: string | { in: string[] }
        workspaceId?: string
        name?: string
      }>
    },
    tx: DatabaseClient = db,
  ): Promise<CustomFieldModel | undefined> {
    return await tx.query.customFieldModel.findFirst({ where: props.where })
  }

  /**
   * Batched lookup for export: ids come from the exported flow graph, which is
   * untrusted input, so `workspaceId` is required alongside `inArray(id, ids)`
   * — without it a stale or planted id could leak another workspace's field
   * name. Ids that don't resolve (already-deleted fields) are simply absent
   * from the result; callers must not treat that as an error.
   */
  async findManyByIds(
    props: { workspaceId: string; ids: string[] },
    tx: DatabaseClient = db,
  ): Promise<CustomFieldModel[]> {
    const { workspaceId, ids } = props
    if (ids.length === 0) {
      return []
    }
    return await tx.query.customFieldModel.findMany({
      where: { workspaceId, id: { in: ids } },
    })
  }

  async existsByNameAndType(
    props: {
      workspaceId: string
      type: CustomFieldType
      name: string
      excludeId?: string
    },
    tx: DatabaseClient = db,
  ): Promise<boolean> {
    const existing = await tx.query.customFieldModel.findFirst({
      columns: { id: true },
      where: {
        workspaceId: props.workspaceId,
        type: props.type,
        name: props.name,
        id: props.excludeId ? { ne: props.excludeId } : undefined,
      },
    })
    return Boolean(existing)
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
  async resolveByNameAndType(
    props: {
      workspaceId: string
      fields: { name: string; type: CustomFieldType }[]
    },
    tx: DatabaseClient = db,
  ): Promise<{ idMap: Map<string, string>; createdIds: string[] }> {
    const { workspaceId, fields } = props

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

  async create(
    props: CreateCustomFieldParams,
    tx: DatabaseClient = db,
  ): Promise<CustomFieldModel> {
    const [field] = await tx
      .insert(customFieldModel)
      .values({ id: createId(), showInInbox: true, ...props })
      .returning()
    return field
  }

  async update(
    props: { id: string; data: UpdateCustomFieldParams },
    tx: DatabaseClient = db,
  ): Promise<CustomFieldModel | undefined> {
    const [updated] = await tx
      .update(customFieldModel)
      .set(props.data)
      .where(eq(customFieldModel.id, props.id))
      .returning()
    return updated
  }

  async delete(
    props: { workspaceId: string; ids: string[] },
    tx: DatabaseClient = db,
  ): Promise<void> {
    await tx
      .delete(customFieldModel)
      .where(
        and(
          eq(customFieldModel.workspaceId, props.workspaceId),
          inArray(customFieldModel.id, props.ids),
        ),
      )
  }
}

export const customFieldRepository = new CustomFieldRepository()
