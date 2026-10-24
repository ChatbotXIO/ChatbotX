import {
  and,
  asc,
  count,
  type DatabaseClient,
  db,
  eq,
  getTableColumns,
  ilike,
  inArray,
  sql,
} from "@chatbotx.io/database/client"
import { productModel, vendorModel } from "@chatbotx.io/database/schema"
import { likeContains, parsePagination } from "@chatbotx.io/database/utils"
import { createId } from "@chatbotx.io/utils"

/** Every column a vendor form or API writes. */
export type VendorWriteValues = Omit<
  typeof vendorModel.$inferInsert,
  "id" | "workspaceId" | "createdAt" | "updatedAt"
> & { name: string }

// Built per call, not at module load: test suites mock the client module and
// importing this file must not need its `sql` tag.
const lowerName = () => sql<string>`lower(${vendorModel.name})`

export type VendorListInput = {
  workspaceId: string
  /** Case-insensitive part of the name. */
  name?: string | null
  page?: number
  perPage?: number
}

const vendorListWhere = (input: {
  workspaceId: string
  name?: string | null
}) =>
  and(
    eq(vendorModel.workspaceId, input.workspaceId),
    input.name ? ilike(vendorModel.name, likeContains(input.name)) : undefined,
  )

export const vendorRepository = {
  /** Every vendor (or one page of them) with how many products each has. */
  async listWithProductCount(input: VendorListInput, tx: DatabaseClient = db) {
    const pagination = parsePagination(input)
    const where = vendorListWhere(input)
    const query = tx
      .select({
        ...getTableColumns(vendorModel),
        productCount: count(productModel.id),
      })
      .from(vendorModel)
      .leftJoin(
        productModel,
        and(
          eq(productModel.vendorId, vendorModel.id),
          eq(productModel.workspaceId, input.workspaceId),
        ),
      )
      .where(where)
      .groupBy(vendorModel.id)
      .orderBy(
        asc(vendorModel.rank),
        asc(vendorModel.name),
        asc(vendorModel.id),
      )
    const [data, total] = await Promise.all([
      pagination
        ? query.limit(pagination.limit).offset(pagination.offset)
        : query,
      tx.$count(vendorModel, where),
    ])
    return {
      data,
      pageCount: pagination?.limit ? Math.ceil(total / pagination.limit) : 1,
    }
  },

  async listOptions(workspaceId: string, tx: DatabaseClient = db) {
    return await tx
      .select({ id: vendorModel.id, name: vendorModel.name })
      .from(vendorModel)
      .where(eq(vendorModel.workspaceId, workspaceId))
      .orderBy(asc(vendorModel.rank), asc(vendorModel.name))
  },

  async find(
    input: { workspaceId: string; vendorId: string },
    tx: DatabaseClient = db,
  ) {
    return await tx.query.vendorModel.findFirst({
      where: { id: input.vendorId, workspaceId: input.workspaceId },
    })
  },

  /** Case-insensitive, matching `Vendor_workspaceId_name_key`. */
  async findByNames(
    input: { workspaceId: string; names: string[] },
    tx: DatabaseClient = db,
  ) {
    const lowered = Array.from(
      new Set(input.names.map((name) => name.trim().toLowerCase())),
    ).filter(Boolean)
    if (lowered.length === 0) {
      return []
    }
    return await tx
      .select({ id: vendorModel.id, name: vendorModel.name })
      .from(vendorModel)
      .where(
        and(
          eq(vendorModel.workspaceId, input.workspaceId),
          inArray(lowerName(), lowered),
        ),
      )
  },

  /**
   * Inserts the names that are not there yet. A concurrent import creating the
   * same vendor is not an error: the unique index turns it into a no-op and
   * the caller reads the row back.
   */
  async createMissing(
    input: { workspaceId: string; names: string[] },
    tx: DatabaseClient = db,
  ) {
    const byLowerName = new Map<string, string>()
    for (const name of input.names) {
      const trimmed = name.trim()
      if (trimmed && !byLowerName.has(trimmed.toLowerCase())) {
        byLowerName.set(trimmed.toLowerCase(), trimmed)
      }
    }
    if (byLowerName.size === 0) {
      return
    }
    await tx
      .insert(vendorModel)
      .values(
        Array.from(byLowerName.values()).map((name) => ({
          id: createId(),
          workspaceId: input.workspaceId,
          name,
        })),
      )
      .onConflictDoNothing()
  },

  async create(
    input: VendorWriteValues & { workspaceId: string },
    tx: DatabaseClient = db,
  ) {
    const [row] = await tx
      .insert(vendorModel)
      .values({ ...input, id: createId() })
      .returning()
    return row
  },

  async update(
    input: {
      workspaceId: string
      vendorId: string
      values: Partial<VendorWriteValues>
    },
    tx: DatabaseClient = db,
  ) {
    const [row] = await tx
      .update(vendorModel)
      .set(input.values)
      .where(
        and(
          eq(vendorModel.id, input.vendorId),
          eq(vendorModel.workspaceId, input.workspaceId),
        ),
      )
      .returning()
    return row
  },

  async delete(
    input: { workspaceId: string; vendorId: string },
    tx: DatabaseClient = db,
  ) {
    const [row] = await tx
      .delete(vendorModel)
      .where(
        and(
          eq(vendorModel.id, input.vendorId),
          eq(vendorModel.workspaceId, input.workspaceId),
        ),
      )
      .returning()
    return row
  },
}
