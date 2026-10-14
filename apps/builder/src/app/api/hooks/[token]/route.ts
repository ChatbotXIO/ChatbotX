import { toLoggableDatabaseError } from "@chatbotx.io/database/client"
import { type NextRequest, NextResponse } from "next/server"
import { INBOUND_WEBHOOK_ERROR_CODE } from "@/features/inbound-webhooks/lib/error-codes"
import { handleInboundWebhookRequest } from "@/features/inbound-webhooks/lib/handle-inbound-request"
import { logger } from "@/lib/log"

type RouteContext = { params: Promise<{ token: string }> }

const NO_STORE = { "Cache-Control": "no-store" }

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { token } = await context.params
    const { status, body, headers } = await handleInboundWebhookRequest({
      token,
      request,
    })
    return NextResponse.json(body, {
      status,
      headers: { ...NO_STORE, ...headers },
    })
  } catch (err) {
    // Never log the request: its URL carries the token and its body is data
    // the sender owns.
    logger.error(
      { err: toLoggableDatabaseError(err) },
      "Inbound webhook request failed",
    )
    return NextResponse.json(
      {
        accepted: false,
        code: INBOUND_WEBHOOK_ERROR_CODE.systemError,
        message: "Please retry",
      },
      { status: 500, headers: NO_STORE },
    )
  }
}

const methodNotAllowed = () =>
  new NextResponse(null, {
    status: 405,
    headers: { Allow: "POST", ...NO_STORE },
  })

export const GET = methodNotAllowed
export const PUT = methodNotAllowed
export const PATCH = methodNotAllowed
export const DELETE = methodNotAllowed
export const OPTIONS = methodNotAllowed
