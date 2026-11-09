import { receiveWooCommerceWebhook } from "@chatbotx.io/business"
import { type NextRequest, NextResponse } from "next/server"
import { logger } from "@/lib/log"

export const dynamic = "force-dynamic"

type RouteContext = { params: Promise<{ workspaceId: string }> }

const ID_PATTERN = /^\d+$/

/**
 * Where the connected WooCommerce store delivers product, order and coupon
 * changes. The signature is checked with the secret we registered the
 * webhook with; the change is queued and answered 200 at once, a bad
 * signature 401, and an error 500 (WooCommerce counts it as a failure).
 */
export async function POST(request: NextRequest, context: RouteContext) {
  const { workspaceId } = await context.params
  if (!ID_PATTERN.test(workspaceId)) {
    return new NextResponse(null, { status: 404 })
  }
  try {
    const { status } = await receiveWooCommerceWebhook({
      workspaceId,
      rawBody: await request.text(),
      headers: request.headers,
    })
    return NextResponse.json({ received: status === 200 }, { status })
  } catch (err) {
    logger.error({ err }, "[woocommerce] the webhook could not be handled")
    return NextResponse.json({ received: false }, { status: 500 })
  }
}
