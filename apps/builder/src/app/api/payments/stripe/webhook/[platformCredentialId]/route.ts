import { receiveStripeWebhook } from "@chatbotx.io/business"
import { type NextRequest, NextResponse } from "next/server"
import { logger } from "@/lib/log"

export const dynamic = "force-dynamic"

type RouteContext = { params: Promise<{ platformCredentialId: string }> }

const ID_PATTERN = /^\d+$/

/**
 * The platform's Stripe Connect webhook (one per platform Stripe app). The
 * raw body is read as is: the signature covers it byte for byte. A payment
 * event is queued and answered 200 at once; a bad signature is 400 so Stripe
 * shows it, and an error is 500 so Stripe delivers it again.
 */
export async function POST(request: NextRequest, context: RouteContext) {
  const { platformCredentialId } = await context.params
  if (!ID_PATTERN.test(platformCredentialId)) {
    return new NextResponse(null, { status: 404 })
  }
  try {
    const { status } = await receiveStripeWebhook({
      platformCredentialId,
      rawBody: await request.text(),
      headers: request.headers,
    })
    return NextResponse.json({ received: status === 200 }, { status })
  } catch (err) {
    logger.error({ err }, "[payments] the Stripe webhook could not be handled")
    return NextResponse.json({ received: false }, { status: 500 })
  }
}
