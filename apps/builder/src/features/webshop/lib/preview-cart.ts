import "server-only"

import { cartLineSchema } from "@chatbotx.io/database/partials"
import { cookies } from "next/headers"
import { z } from "zod"

/**
 * A preview link names no contact, so its cart lives in a cookie instead of
 * the database: the merchant walks through the whole shop — cart, discount
 * codes, checkout form — and only placing the order is off.
 */

/** Keeps the cookie well under the browser's 4 KB limit. */
export const MAX_PREVIEW_CART_LINES = 30

// A preview link itself works for a day.
const PREVIEW_CART_MAX_AGE_SECONDS = 24 * 60 * 60

const previewCartSchema = z.object({
  items: z.array(cartLineSchema).max(MAX_PREVIEW_CART_LINES),
  discountCode: z.string().max(64).nullable(),
})

export type PreviewCart = z.infer<typeof previewCartSchema>

const EMPTY_PREVIEW_CART: PreviewCart = { items: [], discountCode: null }

const cookieName = (workspaceId: string) => `shop-preview-cart-${workspaceId}`

/** The preview cart of this shop; empty when there is none or it is unreadable. */
export async function readPreviewCart(
  workspaceId: string,
): Promise<PreviewCart> {
  const value = (await cookies()).get(cookieName(workspaceId))?.value
  if (!value) {
    return EMPTY_PREVIEW_CART
  }
  try {
    const parsed = previewCartSchema.safeParse(JSON.parse(value))
    return parsed.success ? parsed.data : EMPTY_PREVIEW_CART
  } catch {
    return EMPTY_PREVIEW_CART
  }
}

/** Only from a server action: a page cannot set cookies. */
export async function writePreviewCart(workspaceId: string, cart: PreviewCart) {
  ;(await cookies()).set(cookieName(workspaceId), JSON.stringify(cart), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: `/shop/${workspaceId}`,
    maxAge: PREVIEW_CART_MAX_AGE_SECONDS,
  })
}

export const countPreviewCartItems = (cart: PreviewCart) =>
  cart.items.reduce((sum, line) => sum + line.quantity, 0)
