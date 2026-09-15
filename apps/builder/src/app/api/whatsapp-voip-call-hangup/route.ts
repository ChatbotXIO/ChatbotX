import { ChatbotXException } from "@chatbotx.io/business/errors"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { endVoipCallAsAgent } from "@/features/integration-whatsapp/calling/actions/end-voip-call-as-agent"
import {
  assertCurrentUserCanAccessChatbot,
  getCurrentUserId,
} from "@/lib/auth/utils"
import { serverErrorHandler } from "@/lib/errors/server-handler"
import { isCrossSiteRequest } from "@/lib/http/same-site-request"
import { logger } from "@/lib/log"

const hangupBeaconSchema = z.object({
  workspaceId: zodBigintAsString(),
  whatsappCallId: zodBigintAsString(),
})

/**
 * Best-effort unload target for an ACTIVE VoIP call's `pagehide` handler
 * (`use-whatsapp-voip-call.ts`) — `navigator.sendBeacon` cannot invoke a
 * next-safe-action server action (those expect a multipart action-id
 * encoding a beacon request cannot produce), so this is a tiny dedicated
 * route doing the same `endVoipCallAsAgent` hangup as
 * `hangupWhatsappVoipCallAction`. A same-origin `sendBeacon` POST still
 * carries the session cookie, so auth works exactly like every other
 * authenticated route here.
 *
 * Always best-effort: the browser never reads a beacon's response, unload
 * beacons are inherently unreliable, and Meta's own accept/expiry deadline
 * remains the authoritative backstop for a call this never reaches.
 */
export async function POST(req: NextRequest) {
  try {
    if (isCrossSiteRequest(req)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const userId = await getCurrentUserId()
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json().catch(() => null)
    const parsed = hangupBeaconSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }
    const { workspaceId, whatsappCallId } = parsed.data

    // Membership check, mirroring `api/whatsapp-call-recording` — thrown as
    // a `ChatbotXException` and mapped to a 4xx by `serverErrorHandler`.
    await assertCurrentUserCanAccessChatbot(workspaceId)

    await endVoipCallAsAgent({
      whatsappCallId,
      workspaceId,
      userId,
      graphFailureLog:
        "WhatsApp VoIP call hangup beacon: Graph action failed (call still finalized locally)",
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    if (!(error instanceof ChatbotXException)) {
      logger.error({ err: error }, "WhatsApp VoIP call hangup beacon failed")
    }
    return serverErrorHandler(error)
  }
}
