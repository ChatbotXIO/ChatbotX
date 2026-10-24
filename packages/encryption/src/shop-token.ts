import { z } from "zod"
import {
  signAppointmentToken,
  verifyAppointmentToken,
} from "./appointment-token-utils"

const TOKEN_AAD = "shop-token"
// Long enough for a customer to come back to a shop link days after it was sent.
export const SHOP_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000
// A merchant's preview only needs to last the session they opened it in.
export const SHOP_PREVIEW_TOKEN_TTL_MS = 24 * 60 * 60 * 1000

/**
 * Who a shop link was sent to. `preview` links are opened by the merchant
 * from the builder: they browse the shop but never place an order, so they
 * carry no contact.
 */
export const shopTokenPayloadSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("customer"),
    workspaceId: z.string().min(1),
    contactId: z.string().min(1),
    contactInboxId: z.string().min(1).nullable(),
    conversationId: z.string().min(1).nullable(),
    expiresAt: z.number(),
  }),
  z.object({
    mode: z.literal("preview"),
    workspaceId: z.string().min(1),
    expiresAt: z.number(),
  }),
])

export type ShopTokenPayload = z.infer<typeof shopTokenPayloadSchema>
export type ShopCustomerTokenPayload = Extract<
  ShopTokenPayload,
  { mode: "customer" }
>

/**
 * Signs the customer a shop link was sent to, so the cart and the order are
 * the contact the bot was talking to — never an id typed into the URL.
 */
export async function signShopToken(
  payload: Omit<ShopCustomerTokenPayload, "expiresAt" | "mode">,
  ttlMs = SHOP_TOKEN_TTL_MS,
): Promise<string> {
  return await signAppointmentToken(
    { ...payload, mode: "customer", expiresAt: Date.now() + ttlMs },
    TOKEN_AAD,
  )
}

/** A merchant's look at their own shop: browsable, never orderable. */
export async function signShopPreviewToken(
  workspaceId: string,
): Promise<string> {
  return await signAppointmentToken(
    {
      mode: "preview",
      workspaceId,
      expiresAt: Date.now() + SHOP_PREVIEW_TOKEN_TTL_MS,
    },
    TOKEN_AAD,
  )
}

export async function verifyShopToken(
  token: string,
): Promise<ShopTokenPayload> {
  return await verifyAppointmentToken(token, TOKEN_AAD, shopTokenPayloadSchema)
}
