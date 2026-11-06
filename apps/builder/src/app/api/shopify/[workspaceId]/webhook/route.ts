import { receiveShopifyWebhook } from "@chatbotx.io/business"
import { type NextRequest, NextResponse } from "next/server"
import { logger } from "@/lib/log"

export const dynamic = "force-dynamic"

type RouteContext = { params: Promise<{ workspaceId: string }> }

const ID_PATTERN = /^\d+$/

/**
 * Where the connected Shopify store delivers product, inventory, order and
 * discount changes. The HMAC is checked with the app's secret; the change is
 * queued and answered 200 at once, a bad signature 401, and an error 500 so
 * Shopify delivers it again.
 */
export async function POST(request: NextRequest, context: RouteContext) {
  const { workspaceId } = await context.params
  if (!ID_PATTERN.test(workspaceId)) {
    return new NextResponse(null, { status: 404 })
  }
  try {
    const { status } = await receiveShopifyWebhook({
      workspaceId,
      rawBody: await request.text(),
      headers: request.headers,
    })
    return NextResponse.json({ received: status === 200 }, { status })
  } catch (err) {
    logger.error({ err }, "[shopify] the webhook could not be handled")
    return NextResponse.json({ received: false }, { status: 500 })
  }
}
