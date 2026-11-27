import { receiveStripeAccountWebhook } from "@chatbotx.io/business"
import { type NextRequest, NextResponse } from "next/server"
import { logger } from "@/lib/log"

export const dynamic = "force-dynamic"

type RouteContext = { params: Promise<{ workspaceId: string }> }

const ID_PATTERN = /^\d+$/

/**
 * The webhook on a store's own Stripe account (created when it connected
 * with its secret key). The signature is checked with that webhook's secret;
 * a payment event is queued and answered 200 at once, a bad signature 400,
 * and an error 500 so Stripe delivers it again.
 */
export async function POST(request: NextRequest, context: RouteContext) {
  const { workspaceId } = await context.params
  if (!ID_PATTERN.test(workspaceId)) {
    return new NextResponse(null, { status: 404 })
  }
  try {
    const { status } = await receiveStripeAccountWebhook({
      workspaceId,
      rawBody: await request.text(),
      headers: request.headers,
    })
    return NextResponse.json({ received: status === 200 }, { status })
  } catch (err) {
    logger.error({ err }, "[payments] the Stripe webhook could not be handled")
    return NextResponse.json({ received: false }, { status: 500 })
  }
}
