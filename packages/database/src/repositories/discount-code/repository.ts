import {
  and,
  asc,
  type DatabaseClient,
  db,
  desc,
  eq,
  gt,
  ilike,
  inArray,
  isNull,
  lte,
  or,
  sql,
} from "@chatbotx.io/database/client"
import {
  discountCodeModel,
  discountCodeRedemptionModel,
} from "@chatbotx.io/database/schema"
import { likeContains, parsePagination } from "@chatbotx.io/database/utils"
import { createId } from "@chatbotx.io/utils"

/** Every column the coupon form or API writes. */
export type DiscountCodeWriteValues = Omit<
  typeof discountCodeModel.$inferInsert,
  "id" | "workspaceId" | "createdAt" | "updatedAt" | "usedCount"
>

export type DiscountCodeListInput = {
  workspaceId: string
  /** Case-insensitive part of the code. */
  code?: string | null
  page?: number
  perPage?: number
}

// Built per call, not at module load: test suites mock the client module and
// importing this file must not need its `sql` tag.
const sameCode = (code: string) =>
  sql`lower(${discountCodeModel.code}) = lower(${code.trim()})`

export const discountCodeRepository = {
  /**
   * Takes deleted products out of every "specific products" code that lists
   * them. A code left with no product would silently apply to nothing, so it
   * is switched off for the merchant to fix.
   */
  async removeProductIds(
    input: { workspaceId: string; productIds: string[] },
    tx: DatabaseClient = db,
  ) {
    if (input.productIds.length === 0) {
      return
    }
    const removed = sql.join(
      input.productIds.map((id) => sql`${id}`),
      sql`, `,
    )
    const listsRemoved = sql`exists (select 1 from jsonb_array_elements_text(${discountCodeModel.productIds}) as listed(id) where listed.id in (${removed}))`
    await tx
      .update(discountCodeModel)
      .set({
        productIds: sql`coalesce((select jsonb_agg(to_jsonb(listed.id)) from jsonb_array_elements_text(${discountCodeModel.productIds}) as listed(id) where listed.id not in (${removed})), '[]'::jsonb)`,
        isActive: sql`case when exists (select 1 from jsonb_array_elements_text(${discountCodeModel.productIds}) as listed(id) where listed.id not in (${removed})) then ${discountCodeModel.isActive} else false end`,
      })
      .where(
        and(
          eq(discountCodeModel.workspaceId, input.workspaceId),
          eq(discountCodeModel.appliesTo, "products"),
          listsRemoved,
        ),
      )
  },

  /**
   * Switches off the "category" codes pointing at these categories. Run before
   * the category rows go: the foreign key then clears `categoryId`, and a code
   * that still says "category" with none chosen applies to nothing.
   */
  async deactivateByCategoryIds(
    input: { workspaceId: string; categoryIds: string[] },
    tx: DatabaseClient = db,
  ) {
    if (input.categoryIds.length === 0) {
      return
    }
    await tx
      .update(discountCodeModel)
      .set({ isActive: false })
      .where(
        and(
          eq(discountCodeModel.workspaceId, input.workspaceId),
          eq(discountCodeModel.appliesTo, "category"),
          inArray(discountCodeModel.categoryId, input.categoryIds),
        ),
      )
  },

  async list(input: DiscountCodeListInput, tx: DatabaseClient = db) {
    const pagination = parsePagination(input)
    const where = and(
      eq(discountCodeModel.workspaceId, input.workspaceId),
      input.code
        ? ilike(discountCodeModel.code, likeContains(input.code))
        : undefined,
    )
    const query = tx
      .select()
      .from(discountCodeModel)
      .where(where)
      .orderBy(desc(discountCodeModel.createdAt), desc(discountCodeModel.id))
    const [data, total] = await Promise.all([
      pagination
        ? query.limit(pagination.limit).offset(pagination.offset)
        : query,
      tx.$count(discountCodeModel, where),
    ])
    return {
      data,
      pageCount: pagination?.limit ? Math.ceil(total / pagination.limit) : 1,
    }
  },

  async find(
    input: { workspaceId: string; discountCodeId: string },
    tx: DatabaseClient = db,
  ) {
    return await tx.query.discountCodeModel.findFirst({
      where: { id: input.discountCodeId, workspaceId: input.workspaceId },
    })
  },

  async findByCode(
    input: { workspaceId: string; code: string },
    tx: DatabaseClient = db,
  ) {
    const [row] = await tx
      .select()
      .from(discountCodeModel)
      .where(
        and(
          eq(discountCodeModel.workspaceId, input.workspaceId),
          sameCode(input.code),
        ),
      )
      .limit(1)
    return row
  },

  /**
   * Locks the code until the transaction ends, so two orders using its last
   * use (or one customer's two orders) are checked one after the other.
   */
  async lock(
    input: { workspaceId: string; discountCodeId: string },
    tx: DatabaseClient,
  ) {
    const [row] = await tx
      .select()
      .from(discountCodeModel)
      .where(
        and(
          eq(discountCodeModel.id, input.discountCodeId),
          eq(discountCodeModel.workspaceId, input.workspaceId),
        ),
      )
      .for("update")
    return row
  },

  /** Codes that apply themselves, on and within their dates at `now`. */
  async listAutoApply(
    input: { workspaceId: string; now: Date },
    tx: DatabaseClient = db,
  ) {
    return await tx
      .select()
      .from(discountCodeModel)
      .where(
        and(
          eq(discountCodeModel.workspaceId, input.workspaceId),
          eq(discountCodeModel.autoApply, true),
          eq(discountCodeModel.isActive, true),
          lte(discountCodeModel.startsAt, input.now),
          or(
            isNull(discountCodeModel.endsAt),
            gt(discountCodeModel.endsAt, input.now),
          ),
          or(
            isNull(discountCodeModel.usageLimit),
            sql`${discountCodeModel.usedCount} < ${discountCodeModel.usageLimit}`,
          ),
        ),
      )
      .orderBy(asc(discountCodeModel.createdAt), asc(discountCodeModel.id))
  },

  /**
   * Codes a customer may be shown on the cart: typed (not automatic), turned
   * on and started — for everyone or for customers matching a filter (the
   * cart says when this customer does not match). Ended or used-up ones are listed too —
   * the cart shows them greyed out — but after the ones still running with
   * uses left, so they never crowd those out of `limit`. Newest first within
   * each.
   */
  async listOffered(
    input: { workspaceId: string; now: Date; limit: number },
    tx: DatabaseClient = db,
  ) {
    const usable = and(
      or(
        isNull(discountCodeModel.endsAt),
        gt(discountCodeModel.endsAt, input.now),
      ),
      or(
        isNull(discountCodeModel.usageLimit),
        sql`${discountCodeModel.usedCount} < ${discountCodeModel.usageLimit}`,
      ),
    )
    return await tx
      .select()
      .from(discountCodeModel)
      .where(
        and(
          eq(discountCodeModel.workspaceId, input.workspaceId),
          eq(discountCodeModel.autoApply, false),
          eq(discountCodeModel.isActive, true),
          lte(discountCodeModel.startsAt, input.now),
        ),
      )
      .orderBy(
        sql`case when ${usable} then 0 else 1 end`,
        desc(discountCodeModel.createdAt),
        desc(discountCodeModel.id),
      )
      .limit(input.limit)
  },

  async create(
    input: DiscountCodeWriteValues & { workspaceId: string },
    tx: DatabaseClient = db,
  ) {
    const [row] = await tx
      .insert(discountCodeModel)
      .values({ id: createId(), ...input })
      .returning()
    return row
  },

  async update(
    input: {
      workspaceId: string
      discountCodeId: string
      values: Partial<DiscountCodeWriteValues>
    },
    tx: DatabaseClient = db,
  ) {
    const [row] = await tx
      .update(discountCodeModel)
      .set(input.values)
      .where(
        and(
          eq(discountCodeModel.id, input.discountCodeId),
          eq(discountCodeModel.workspaceId, input.workspaceId),
        ),
      )
      .returning()
    return row
  },

  async delete(
    input: { workspaceId: string; discountCodeId: string },
    tx: DatabaseClient = db,
  ) {
    const [row] = await tx
      .delete(discountCodeModel)
      .where(
        and(
          eq(discountCodeModel.id, input.discountCodeId),
          eq(discountCodeModel.workspaceId, input.workspaceId),
        ),
      )
      .returning()
    return row
  },

  /** One more use; `undefined` when the limit is already reached. */
  async incrementUsed(discountCodeId: string, tx: DatabaseClient) {
    const [row] = await tx
      .update(discountCodeModel)
      .set({ usedCount: sql`${discountCodeModel.usedCount} + 1` })
      .where(
        and(
          eq(discountCodeModel.id, discountCodeId),
          or(
            isNull(discountCodeModel.usageLimit),
            sql`${discountCodeModel.usedCount} < ${discountCodeModel.usageLimit}`,
          ),
        ),
      )
      .returning({ id: discountCodeModel.id })
    return row
  },

  async decrementUsed(discountCodeId: string, tx: DatabaseClient) {
    await tx
      .update(discountCodeModel)
      .set({
        usedCount: sql`greatest(${discountCodeModel.usedCount} - 1, 0)`,
      })
      .where(eq(discountCodeModel.id, discountCodeId))
  },

  async countRedemptions(
    input: { discountCodeId: string; contactId: string },
    tx: DatabaseClient = db,
  ) {
    return await tx.$count(
      discountCodeRedemptionModel,
      and(
        eq(discountCodeRedemptionModel.discountCodeId, input.discountCodeId),
        eq(discountCodeRedemptionModel.contactId, input.contactId),
      ),
    )
  },

  async insertRedemption(
    input: Omit<
      typeof discountCodeRedemptionModel.$inferInsert,
      "id" | "createdAt" | "updatedAt"
    >,
    tx: DatabaseClient,
  ) {
    const [row] = await tx
      .insert(discountCodeRedemptionModel)
      .values({ id: createId(), ...input })
      .returning()
    return row
  },

  /** Removes an order's use of a code; returns it so the count goes back. */
  async deleteRedemptionByOrder(
    input: { workspaceId: string; orderId: string },
    tx: DatabaseClient,
  ) {
    const [row] = await tx
      .delete(discountCodeRedemptionModel)
      .where(
        and(
          eq(discountCodeRedemptionModel.orderId, input.orderId),
          eq(discountCodeRedemptionModel.workspaceId, input.workspaceId),
        ),
      )
      .returning()
    return row
  },
}
