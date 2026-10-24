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
 * Runs `operation` for the customer the signed token names, or `onPreview`
 * for a preview link (its cart is a cookie, see `preview-cart.ts`). A preview
 * link without `onPreview` — placing or rating an order — a token for another
 * workspace, too many calls, and every business refusal come back as an
 * error code instead of a thrown error.
 */
export async function runShopAction<T>(
  input: { workspaceId: string; token: string },
  operation: (shopper: WebshopShopper) => Promise<T>,
  onPreview?: (workspaceId: string) => Promise<T>,
): Promise<ShopActionResult<T>> {
  const session = await resolveShopSession(input.workspaceId, input.token)
  if (!session) {
    return fail({ code: "invalidLink" })
  }
  if (session.mode === "preview") {
    if (!onPreview) {
      return fail({ code: "webshopPreviewOnly" })
    }
    const previewKey = `preview-${session.workspaceId}`
    const limited = await isRateLimited(session.workspaceId, previewKey)
    if (limited) {
      return fail({ code: "rateLimited" })
    }
    return await runReportingRefusals(() => onPreview(session.workspaceId))
  }
  const { shopper } = session
  if (await isRateLimited(shopper.workspaceId, shopper.contactId)) {
    return fail({ code: "rateLimited" })
  }
  return await runReportingRefusals(() => operation(shopper))
}

const isRateLimited = async (workspaceId: string, shopperKey: string) => {
  const rateLimit = await checkGuestRateLimit({
    webchatId: `shop-${workspaceId}`,
    clientIp: resolveGuestRateLimitKey(await headers(), shopperKey),
    guestConversationId: shopperKey,
  })
  return rateLimit.limited
}

/** A business refusal comes back as its error code; anything else throws. */
async function runReportingRefusals<T>(
  operation: () => Promise<T>,
): Promise<ShopActionResult<T>> {
  try {
    return { ok: true, data: await operation() }
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
