import "server-only"

import type { WebshopShopper } from "@chatbotx.io/business"
import { verifyShopToken } from "@chatbotx.io/encryption/shop-token"

/**
 * Who is shopping, read from the signed `token` of a shop link. A customer
 * link names the contact the cart and orders belong to; a preview link is a
 * merchant's look at their own shop and can never order.
 */
export type ShopSession =
  | { mode: "customer"; token: string; shopper: WebshopShopper }
  | { mode: "preview"; token: string; workspaceId: string }

// Only bigint ids reach the database lookup.
const WORKSPACE_ID_PATTERN = /^\d{1,20}$/

/**
 * `null` for a missing, forged or expired token, for one signed for another
 * workspace than the URL's, or for an unresolved `{{shop_token}}` (a link
 * opened outside a flow).
 */
export async function resolveShopSession(
  workspaceId: string,
  token: string | null | undefined,
): Promise<ShopSession | null> {
  if (!(token && WORKSPACE_ID_PATTERN.test(workspaceId))) {
    return null
  }
  if (token.startsWith("{{")) {
    return null
  }
  try {
    const payload = await verifyShopToken(token)
    if (payload.workspaceId !== workspaceId) {
      return null
    }
    if (payload.mode === "preview") {
      return { mode: "preview", token, workspaceId }
    }
    return {
      mode: "customer",
      token,
      shopper: {
        workspaceId: payload.workspaceId,
        contactId: payload.contactId,
        contactInboxId: payload.contactInboxId,
        conversationId: payload.conversationId,
      },
    }
  } catch {
    return null
  }
}
