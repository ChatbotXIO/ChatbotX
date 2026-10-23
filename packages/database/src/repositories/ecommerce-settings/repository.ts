import {
  and,
  type DatabaseClient,
  db,
  eq,
  ne,
  sql,
} from "@chatbotx.io/database/client"
import {
  ecommerceOrderCounterModel,
  ecommerceSettingsModel,
  productModel,
} from "@chatbotx.io/database/schema"
import { createId } from "@chatbotx.io/utils"

/** Every settings column. Always written whole, never left to a default. */
export type EcommerceSettingsValues = Omit<
  typeof ecommerceSettingsModel.$inferInsert,
  "id" | "workspaceId" | "createdAt" | "updatedAt"
>

export const ecommerceSettingsRepository = {
  async find(workspaceId: string, tx: DatabaseClient = db) {
    return await tx.query.ecommerceSettingsModel.findFirst({
      where: { workspaceId },
    })
  },

  /** Creates the row from the given values when the workspace has none. */
  async insertIfMissing(
    input: { workspaceId: string; values: EcommerceSettingsValues },
    tx: DatabaseClient = db,
  ) {
    await tx
      .insert(ecommerceSettingsModel)
      .values({
        id: createId(),
        workspaceId: input.workspaceId,
        ...input.values,
      })
      .onConflictDoNothing({ target: ecommerceSettingsModel.workspaceId })
  },

  /** Reads the row and holds its lock until the transaction ends. */
  async findForUpdate(workspaceId: string, tx: DatabaseClient) {
    const [row] = await tx
      .select()
      .from(ecommerceSettingsModel)
      .where(eq(ecommerceSettingsModel.workspaceId, workspaceId))
      .for("update")
    return row
  },

  async upsert(
    input: { workspaceId: string; values: EcommerceSettingsValues },
    tx: DatabaseClient = db,
  ) {
    const [row] = await tx
      .insert(ecommerceSettingsModel)
      .values({
        id: createId(),
        workspaceId: input.workspaceId,
        ...input.values,
      })
      .onConflictDoUpdate({
        target: ecommerceSettingsModel.workspaceId,
        set: input.values,
      })
      .returning()
    return row
  },

  /**
   * Hands out the next order number. The upsert holds the counter row lock
   * until the surrounding transaction ends, so two orders in one workspace get
   * consecutive numbers and a rolled-back order gives its number back. Must
   * run inside the transaction that inserts the order.
   */
  async nextOrderNumber(workspaceId: string, tx: DatabaseClient) {
    const [row] = await tx
      .insert(ecommerceOrderCounterModel)
      .values({ workspaceId, lastNumber: 1 })
      .onConflictDoUpdate({
        target: ecommerceOrderCounterModel.workspaceId,
        set: {
          lastNumber: sql`${ecommerceOrderCounterModel.lastNumber} + 1`,
        },
      })
      .returning({ lastNumber: ecommerceOrderCounterModel.lastNumber })
    if (!row) {
      throw new Error("Failed to allocate an order number")
    }
    return row.lastNumber
  },

  async countProductsInOtherCurrency(
    input: { workspaceId: string; currency: string },
    tx: DatabaseClient = db,
  ) {
    return await tx.$count(
      productModel,
      and(
        eq(productModel.workspaceId, input.workspaceId),
        ne(sql`upper(${productModel.currency})`, input.currency.toUpperCase()),
      ),
    )
  },
}
