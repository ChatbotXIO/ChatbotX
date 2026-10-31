import {
  and,
  type DatabaseClient,
  db,
  desc,
  eq,
  getTableColumns,
  ilike,
} from "@chatbotx.io/database/client"
import {
  placeCategoryModel,
  placeLocationModel,
} from "@chatbotx.io/database/schema"
import { likeContains, parsePagination } from "@chatbotx.io/database/utils"
import { createId } from "@chatbotx.io/utils"

/** Every column a place location form or API writes. */
export type PlaceLocationWriteValues = Omit<
  typeof placeLocationModel.$inferInsert,
  "id" | "workspaceId" | "createdAt" | "updatedAt"
>

export type PlaceLocationListInput = {
  workspaceId: string
  /** Case-insensitive part of the name. */
  name?: string | null
  page?: number
  perPage?: number
}

const locationListWhere = (input: {
  workspaceId: string
  name?: string | null
}) =>
  and(
    eq(placeLocationModel.workspaceId, input.workspaceId),
    input.name
      ? ilike(placeLocationModel.name, likeContains(input.name))
      : undefined,
  )

const scoped = (input: { workspaceId: string; locationId: string }) =>
  and(
    eq(placeLocationModel.id, input.locationId),
    eq(placeLocationModel.workspaceId, input.workspaceId),
  )

export const placeLocationRepository = {
  /** Every location (or one page of them), newest first, with its category name. */
  async list(input: PlaceLocationListInput, tx: DatabaseClient = db) {
    const pagination = parsePagination(input)
    const where = locationListWhere(input)
    const query = tx
      .select({
        ...getTableColumns(placeLocationModel),
        categoryName: placeCategoryModel.name,
      })
      .from(placeLocationModel)
      .leftJoin(
        placeCategoryModel,
        and(
          eq(placeCategoryModel.id, placeLocationModel.categoryId),
          eq(placeCategoryModel.workspaceId, input.workspaceId),
        ),
      )
      .where(where)
      .orderBy(desc(placeLocationModel.createdAt), desc(placeLocationModel.id))
    const [data, total] = await Promise.all([
      pagination
        ? query.limit(pagination.limit).offset(pagination.offset)
        : query,
      tx.$count(placeLocationModel, where),
    ])
    return {
      data,
      pageCount: pagination?.limit ? Math.ceil(total / pagination.limit) : 1,
    }
  },

  /** One location with its category name. */
  async find(
    input: { workspaceId: string; locationId: string },
    tx: DatabaseClient = db,
  ) {
    const [row] = await tx
      .select({
        ...getTableColumns(placeLocationModel),
        categoryName: placeCategoryModel.name,
      })
      .from(placeLocationModel)
      .leftJoin(
        placeCategoryModel,
        and(
          eq(placeCategoryModel.id, placeLocationModel.categoryId),
          eq(placeCategoryModel.workspaceId, input.workspaceId),
        ),
      )
      .where(scoped(input))
      .limit(1)
    return row
  },

  /** Coordinates of every location, optionally in one category (null = all). */
  async listCoordinates(
    input: { workspaceId: string; categoryId: string | null },
    tx: DatabaseClient = db,
  ) {
    return await tx
      .select({
        id: placeLocationModel.id,
        name: placeLocationModel.name,
        latitude: placeLocationModel.latitude,
        longitude: placeLocationModel.longitude,
      })
      .from(placeLocationModel)
      .where(
        and(
          eq(placeLocationModel.workspaceId, input.workspaceId),
          input.categoryId === null
            ? undefined
            : eq(placeLocationModel.categoryId, input.categoryId),
        ),
      )
  },

  async create(
    input: PlaceLocationWriteValues & { workspaceId: string },
    tx: DatabaseClient = db,
  ) {
    const [row] = await tx
      .insert(placeLocationModel)
      .values({ ...input, id: createId() })
      .returning()
    return row
  },

  async update(
    input: {
      workspaceId: string
      locationId: string
      values: Partial<PlaceLocationWriteValues>
    },
    tx: DatabaseClient = db,
  ) {
    const [row] = await tx
      .update(placeLocationModel)
      .set(input.values)
      .where(scoped(input))
      .returning()
    return row
  },

  async delete(
    input: { workspaceId: string; locationId: string },
    tx: DatabaseClient = db,
  ) {
    const [row] = await tx
      .delete(placeLocationModel)
      .where(scoped(input))
      .returning()
    return row
  },
}
