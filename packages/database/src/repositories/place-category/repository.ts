import {
  and,
  asc,
  count,
  type DatabaseClient,
  db,
  eq,
  getTableColumns,
  sql,
} from "@chatbotx.io/database/client"
import {
  placeCategoryModel,
  placeLocationModel,
} from "@chatbotx.io/database/schema"
import { createId } from "@chatbotx.io/utils"

/** Every column a place category form or API writes. */
export type PlaceCategoryWriteValues = Omit<
  typeof placeCategoryModel.$inferInsert,
  "id" | "workspaceId" | "createdAt" | "updatedAt"
> & { name: string }

export const placeCategoryRepository = {
  /** Every category with how many locations each has, highest priority first. */
  async listWithLocationCount(workspaceId: string, tx: DatabaseClient = db) {
    return await tx
      .select({
        ...getTableColumns(placeCategoryModel),
        locationCount: count(placeLocationModel.id),
      })
      .from(placeCategoryModel)
      .leftJoin(
        placeLocationModel,
        and(
          eq(placeLocationModel.categoryId, placeCategoryModel.id),
          eq(placeLocationModel.workspaceId, workspaceId),
        ),
      )
      .where(eq(placeCategoryModel.workspaceId, workspaceId))
      .groupBy(placeCategoryModel.id)
      .orderBy(
        asc(placeCategoryModel.rank),
        asc(placeCategoryModel.name),
        asc(placeCategoryModel.id),
      )
  },

  async find(
    input: { workspaceId: string; categoryId: string },
    tx: DatabaseClient = db,
  ) {
    return await tx.query.placeCategoryModel.findFirst({
      where: { id: input.categoryId, workspaceId: input.workspaceId },
    })
  },

  async create(
    input: PlaceCategoryWriteValues & { workspaceId: string },
    tx: DatabaseClient = db,
  ) {
    const [row] = await tx
      .insert(placeCategoryModel)
      .values({ ...input, id: createId() })
      .returning()
    return row
  },

  /**
   * The categories named `names` (case-insensitive, like the unique index),
   * creating the missing ones in ONE insert. Race-safe: a concurrent creator's
   * row wins the unique index and is read back instead of failing.
   * `idByName` maps each (trimmed) requested name to its row, matched by
   * Postgres `lower()` like the index, never a JS case fold. `createdIds` are
   * the rows this call inserted (`RETURNING` reports only those), so a caller
   * can tell a reused category from a new one.
   */
  async findOrCreateByNames(
    input: { workspaceId: string; names: readonly string[] },
    tx: DatabaseClient = db,
  ) {
    const names = [...new Set(input.names.map((name) => name.trim()))]
    if (names.length === 0) {
      return {
        idByName: new Map<string, string>(),
        createdIds: new Set<string>(),
      }
    }
    const created = await tx
      .insert(placeCategoryModel)
      .values(
        names.map((name) => ({
          id: createId(),
          workspaceId: input.workspaceId,
          name,
        })),
      )
      .onConflictDoNothing()
      .returning({ id: placeCategoryModel.id })
    const requested = sql.join(
      names.map((name) => sql`${name}`),
      sql`, `,
    )
    const matched = await tx.execute<{ name: string; id: string }>(
      sql`select requested.name, ${placeCategoryModel.id}::text as id
        from unnest(array[${requested}]::text[]) as requested(name)
        join ${placeCategoryModel}
          on ${placeCategoryModel.workspaceId} = ${input.workspaceId}
         and lower(${placeCategoryModel.name}) = lower(requested.name)`,
    )
    return {
      idByName: new Map(matched.rows.map((row) => [row.name, String(row.id)])),
      createdIds: new Set(created.map((row) => row.id)),
    }
  },

  async update(
    input: {
      workspaceId: string
      categoryId: string
      values: Partial<PlaceCategoryWriteValues>
    },
    tx: DatabaseClient = db,
  ) {
    const [row] = await tx
      .update(placeCategoryModel)
      .set(input.values)
      .where(
        and(
          eq(placeCategoryModel.id, input.categoryId),
          eq(placeCategoryModel.workspaceId, input.workspaceId),
        ),
      )
      .returning()
    return row
  },

  async countLocations(
    input: { workspaceId: string; categoryId: string },
    tx: DatabaseClient,
  ) {
    return await tx.$count(
      placeLocationModel,
      and(
        eq(placeLocationModel.categoryId, input.categoryId),
        eq(placeLocationModel.workspaceId, input.workspaceId),
      ),
    )
  },

  async delete(
    input: { workspaceId: string; categoryId: string },
    tx: DatabaseClient = db,
  ) {
    const [row] = await tx
      .delete(placeCategoryModel)
      .where(
        and(
          eq(placeCategoryModel.id, input.categoryId),
          eq(placeCategoryModel.workspaceId, input.workspaceId),
        ),
      )
      .returning()
    return row
  },
}
