import { ChatbotXException } from "@chatbotx.io/business/errors"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { endVoipCallAsAgent } from "@/features/integration-whatsapp/calling/actions/end-voip-call-as-agent"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import { serverErrorHandler } from "@/lib/errors/server-handler"
import { authorizeWorkspaceBeaconSession } from "@/lib/http/authorize-workspace-beacon-request"
import { logger } from "@/lib/log"

const hangupBeaconSchema = z.object({
  workspaceId: zodBigintAsString(),
  whatsappCallId: zodBigintAsString(),
})

/**
 * Unload target for the VoIP pagehide handler — navigator.sendBeacon can't
 * invoke a next-safe-action (needs a multipart action-id), so this dedicated
 * route does the same hangup. Same-site + session are checked before the
 * body is parsed, so an unauthorized caller always gets 403/401, never a 400.
 * Always best-effort: beacons are unreliable and Meta's own call
 * accept/expiry deadline is the real backstop.
 */
export async function POST(req: NextRequest) {
  try {
    const authorized = await authorizeWorkspaceBeaconSession(req)
    if (authorized instanceof NextResponse) {
      return authorized
    }
    const { userId } = authorized

    const body = await req.json().catch(() => null)
    const parsed = hangupBeaconSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }
    const { workspaceId, whatsappCallId } = parsed.data

    // Membership check, mirroring api/whatsapp-call-recording — thrown as a
    // ChatbotXException and mapped to a 4xx by serverErrorHandler.
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
