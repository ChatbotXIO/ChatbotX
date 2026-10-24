import {
  and,
  type DatabaseClient,
  db,
  eq,
  inArray,
  isNotNull,
  isNull,
  sql,
} from "@chatbotx.io/database/client"
import type { CartLine } from "@chatbotx.io/database/partials"
import { cartModel, ecommerceSettingsModel } from "@chatbotx.io/database/schema"
import { createId } from "@chatbotx.io/utils"

export const cartRepository = {
  async find(
    input: { workspaceId: string; contactId: string },
    tx: DatabaseClient = db,
  ) {
    return await tx.query.cartModel.findFirst({
      where: { workspaceId: input.workspaceId, contactId: input.contactId },
    })
  },

  /**
   * Writes the whole cart. A customer change restarts the abandoned-cart
   * clock, so a reminder already sent for an older cart can go out again.
   */
  async upsert(
    input: {
      workspaceId: string
      contactId: string
      contactInboxId: string | null
      items: CartLine[]
    },
    tx: DatabaseClient = db,
  ) {
    const now = new Date()
    const [row] = await tx
      .insert(cartModel)
      .values({
        id: createId(),
        workspaceId: input.workspaceId,
        contactId: input.contactId,
        contactInboxId: input.contactInboxId,
        items: input.items,
        lastActivityAt: now,
        abandonedNotifiedAt: null,
      })
      .onConflictDoUpdate({
        target: [cartModel.workspaceId, cartModel.contactId],
        set: {
          items: input.items,
          lastActivityAt: now,
          abandonedNotifiedAt: null,
          ...(input.contactInboxId
            ? { contactInboxId: input.contactInboxId }
            : {}),
        },
      })
      .returning()
    return row
  },

  /** Keeps (or clears, with null) the code the customer entered. */
  async setDiscountCode(
    input: {
      workspaceId: string
      contactId: string
      contactInboxId: string | null
      discountCode: string | null
    },
    tx: DatabaseClient = db,
  ) {
    const [row] = await tx
      .insert(cartModel)
      .values({
        id: createId(),
        workspaceId: input.workspaceId,
        contactId: input.contactId,
        contactInboxId: input.contactInboxId,
        items: [],
        discountCode: input.discountCode,
      })
      .onConflictDoUpdate({
        target: [cartModel.workspaceId, cartModel.contactId],
        set: { discountCode: input.discountCode },
      })
      .returning()
    return row
  },

  /**
   * Claims one batch of abandoned carts: with items, not reminded since the
   * customer last changed them, idle longer than their store's reminder
   * delay (stores without one are skipped). Each cart is claimed by setting
   * `abandonedNotifiedAt`, under `SKIP LOCKED`, so overlapping scans never
   * remind the same cart twice; a customer change clears it again.
   */
  async claimAbandoned(
    input: { now: Date; limit: number },
    tx: DatabaseClient = db,
  ) {
    const due = tx
      .select({ id: cartModel.id })
      .from(cartModel)
      .innerJoin(
        ecommerceSettingsModel,
        eq(ecommerceSettingsModel.workspaceId, cartModel.workspaceId),
      )
      .where(
        and(
          isNull(cartModel.abandonedNotifiedAt),
          isNotNull(ecommerceSettingsModel.abandonedCartDelayMinutes),
          sql`jsonb_array_length(${cartModel.items}) > 0`,
          sql`${cartModel.lastActivityAt} < ${input.now.toISOString()}::timestamptz - make_interval(mins => ${ecommerceSettingsModel.abandonedCartDelayMinutes})`,
        ),
      )
      .orderBy(cartModel.lastActivityAt)
      .limit(input.limit)
      .for("update", { of: cartModel, skipLocked: true })
    return await tx
      .update(cartModel)
      .set({ abandonedNotifiedAt: input.now })
      .where(
        and(isNull(cartModel.abandonedNotifiedAt), inArray(cartModel.id, due)),
      )
      .returning()
  },

  /**
   * Locks the contact's cart until the transaction ends, creating an empty
   * one first when there is none — so two quick changes queue up instead of
   * both editing the same old cart.
   */
  async lockOrCreate(
    input: {
      workspaceId: string
      contactId: string
      contactInboxId: string | null
    },
    tx: DatabaseClient,
  ) {
    await tx
      .insert(cartModel)
      .values({
        id: createId(),
        workspaceId: input.workspaceId,
        contactId: input.contactId,
        contactInboxId: input.contactInboxId,
        items: [],
      })
      .onConflictDoNothing({
        target: [cartModel.workspaceId, cartModel.contactId],
      })
    const [row] = await tx
      .select()
      .from(cartModel)
      .where(
        and(
          eq(cartModel.workspaceId, input.workspaceId),
          eq(cartModel.contactId, input.contactId),
        ),
      )
      .for("update")
    return row
  },

  /** Locks the cart until the transaction ends, so a checkout reads it once. */
  async findForUpdate(
    input: { workspaceId: string; contactId: string },
    tx: DatabaseClient,
  ) {
    const [row] = await tx
      .select()
      .from(cartModel)
      .where(
        and(
          eq(cartModel.workspaceId, input.workspaceId),
          eq(cartModel.contactId, input.contactId),
        ),
      )
      .for("update")
    return row
  },
}
