import "server-only"

import type { WebshopShopper } from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { headers } from "next/headers"
import {
  checkGuestRateLimit,
  resolveGuestRateLimitKey,
} from "@/lib/rate-limit/guest-rate-limit"
import type { ShopActionError, ShopActionResult } from "./shop-action-types"
import { resolveShopSession } from "./shop-session"

const fail = (error: ShopActionError) => ({ ok: false, error }) as const

/**
 * Runs `operation` for the customer the signed token names. A preview link,
 * a token for another workspace, too many calls, and every business refusal
 * come back as an error code instead of a thrown error.
 */
export async function runShopAction<T>(
  input: { workspaceId: string; token: string },
  operation: (shopper: WebshopShopper) => Promise<T>,
): Promise<ShopActionResult<T>> {
  const session = await resolveShopSession(input.workspaceId, input.token)
  if (!session) {
    return fail({ code: "invalidLink" })
  }
  if (session.mode === "preview") {
    return fail({ code: "webshopPreviewOnly" })
  }
  const { shopper } = session
  const rateLimit = await checkGuestRateLimit({
    webchatId: `shop-${shopper.workspaceId}`,
    clientIp: resolveGuestRateLimitKey(await headers(), shopper.contactId),
    guestConversationId: shopper.contactId,
  })
  if (rateLimit.limited) {
    return fail({ code: "rateLimited" })
  }
  try {
    return { ok: true, data: await operation(shopper) }
  } catch (error) {
    if (error instanceof ChatbotXException && error.httpStatusCode < 500) {
      return fail({
        code: error.code,
        field: error.field,
        data: error.data,
      })
    }
    throw error
  }
}
