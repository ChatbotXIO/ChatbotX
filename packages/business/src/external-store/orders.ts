import { db } from "@chatbotx.io/database/client"
import type { OrderStatus } from "@chatbotx.io/database/partials"
import {
  cartRepository,
  type OrderItemInsertValues,
} from "@chatbotx.io/database/repositories"
import {
  signShopToken,
  verifyShopToken,
} from "@chatbotx.io/encryption/shop-token"
import { contactService } from "../contact/service"
import { logger } from "../logger"

/**
 * The order attribute (Shopify note attribute, WooCommerce order meta) our
 * web shop checkout stamps with the customer: a signed shop token.
 */
export const EXTERNAL_CONTACT_ATTRIBUTE = "cbx_ref"

/**
 * How long that reference stays valid: a customer may come back to the
 * store's checkout or payment page days later.
 */
const CONTACT_REFERENCE_TTL_MS = 30 * 24 * 60 * 60 * 1000

export type ExternalCheckoutShopper = {
  workspaceId: string
  contactId: string
  contactInboxId: string | null
  conversationId: string | null
}

/** The signed reference our checkout stamps on an external store's order. */
export const signContactReference = (shopper: ExternalCheckoutShopper) =>
  signShopToken(
    {
      workspaceId: shopper.workspaceId,
      contactId: shopper.contactId,
      contactInboxId: shopper.contactInboxId,
      conversationId: shopper.conversationId,
    },
    CONTACT_REFERENCE_TTL_MS,
  )

export type ExternalOrderContact = {
  contactId: string
  contactInboxId: string | null
  conversationId: string | null
  /** Checked out from our shop link (the signed reference matched). */
  fromShopLink: boolean
}

/**
 * The contact behind an external store's order: the signed reference our
 * checkout stamps on it, or else a contact with exactly one of the order's
 * identifiers (`email:…`, `phone:…`, email first). An order placed on the
 * storefront by someone we never talked to has none.
 */
export const resolveExternalOrderContact = async (input: {
  workspaceId: string
  reference: string | null
  identifiers: string[]
}): Promise<ExternalOrderContact | null> => {
  if (input.reference) {
    try {
      const payload = await verifyShopToken(input.reference)
      if (
        payload.mode === "customer" &&
        payload.workspaceId === input.workspaceId
      ) {
        return {
          contactId: payload.contactId,
          contactInboxId: payload.contactInboxId,
          conversationId: payload.conversationId,
          fromShopLink: true,
        }
      }
    } catch {
      // A forged or expired reference falls back to email and phone.
    }
  }
  for (const identifier of input.identifiers) {
    try {
      const contactId = await contactService.resolveIdByIdentifier({
        workspaceId: input.workspaceId,
        identifier,
      })
      return {
        contactId,
        contactInboxId: null,
        conversationId: null,
        fromShopLink: false,
      }
    } catch {
      // Not a contact of this workspace.
    }
  }
  return null
}

/**
 * A customer who checked out on the external store from our shop link: what
 * they ordered leaves their cart, as it does for an order placed here.
 */
export const removeOrderedFromCart = async (input: {
  workspaceId: string
  contact: { contactId: string; contactInboxId: string | null }
  items: Pick<OrderItemInsertValues, "productId" | "variantId">[]
}): Promise<void> => {
  const { workspaceId, contact } = input
  const ordered = new Set(
    input.items.map((item) => `${item.productId}\u0000${item.variantId ?? ""}`),
  )
  try {
    await db.transaction(async (tx) => {
      const cart = await cartRepository.findForUpdate(
        { workspaceId, contactId: contact.contactId },
        tx,
      )
      if (!cart) {
        return
      }
      const left = cart.items.filter(
        (line) =>
          !ordered.has(`${line.productId}\u0000${line.variantId ?? ""}`),
      )
      if (left.length === cart.items.length) {
        return
      }
      await cartRepository.upsert(
        {
          workspaceId,
          contactId: contact.contactId,
          contactInboxId: contact.contactInboxId,
          items: left,
        },
        tx,
      )
    })
  } catch (err) {
    logger.warn(
      { err, workspaceId, contactId: contact.contactId },
      "[external-store] could not empty the cart of a mirrored order",
    )
  }
}

const STATUS_RANK: Record<OrderStatus, number> = {
  pending: 0,
  accepted: 1,
  shipped: 2,
  concluded: 3,
  cancelled: 3,
}

/**
 * The status a mirrored order moves to. A finished order (concluded or
 * cancelled) stays finished, and an order never steps back — the store can
 * report a fulfillment undone, but the customer was already told.
 */
export const nextMirroredStatus = (
  current: OrderStatus,
  incoming: OrderStatus,
): OrderStatus => {
  if (current === "concluded" || current === "cancelled") {
    return current
  }
  if (incoming === "cancelled") {
    return incoming
  }
  return STATUS_RANK[incoming] > STATUS_RANK[current] ? incoming : current
}

/** "Size: M, Color: Black" — as our own order lines label a variant. */
export const variantLabelOf = (combination: Record<string, string> | null) =>
  combination
    ? Object.entries(combination)
        .map(([option, value]) => `${option}: ${value}`)
        .join(", ")
    : null

const WHITESPACE = /\s+/

/** Splits "Nguyen Van A" for a store's first and last name fields. */
export const splitCustomerName = (name: string | null | undefined) => {
  const parts = (name ?? "").trim().split(WHITESPACE).filter(Boolean)
  if (parts.length <= 1) {
    return { firstName: null, lastName: parts[0] ?? "Customer" }
  }
  return {
    firstName: parts.slice(1).join(" "),
    lastName: parts[0] as string,
  }
}

/** A sync error short enough to show and store. */
export const syncErrorMessage = (error: unknown) =>
  (error instanceof Error ? error.message : "The sync failed.").slice(0, 500)
