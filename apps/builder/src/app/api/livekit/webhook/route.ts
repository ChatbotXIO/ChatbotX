import {
  whatsappCallWebhookService,
  whatsappLivekitService,
} from "@chatbotx.io/business"
import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"
import { logger } from "@/lib/log"

/**
 * LiveKit server webhooks for in-app WhatsApp calling (beta).
 *
 * This route is transport-only: it verifies LiveKit's signed Authorization
 * header, translates the LiveKit event shape into domain arguments, and maps
 * each handler's outcome to an HTTP status. All orchestration lives in
 * `whatsappCallWebhookService`. See docs/whatsapp-calling.md for the LiveKit
 * deployment/trunk configuration this expects.
 */

// LiveKit exposes mapped SIP headers as participant attributes. Accept both
// an explicit `headers_to_attributes` mapping ("wacid") and the automatic
// `sip.h.<header>` form.
const WACID_ATTRIBUTE_KEYS = ["wacid", "sip.h.x-wa-meta-wacid"] as const

const readWacidAttribute = (
  attributes: Record<string, string> | undefined,
): string | undefined => {
  for (const key of WACID_ATTRIBUTE_KEYS) {
    const value = attributes?.[key]
    if (value) {
      return value
    }
  }
  return
}

type LivekitEvent = Awaited<
  ReturnType<typeof whatsappLivekitService.receiveWebhook>
>

// A `retry` outcome asks LiveKit to redeliver (its webhooks are at-least-once
// and the downstream CAS/jobId dedup make redelivery safe); anything else ACKs.
const RETRY_RESPONSE = NextResponse.json({ error: "retry" }, { status: 503 })
const OK_RESPONSE = NextResponse.json({ ok: true })

const dispatchEvent = async (event: LivekitEvent): Promise<NextResponse> => {
  switch (event.event) {
    case "participant_joined": {
      const wacid = readWacidAttribute(event.participant?.attributes)
      const roomName = event.room?.name
      if (!(wacid && roomName)) {
        return OK_RESPONSE
      }
      const outcome =
        await whatsappCallWebhookService.handleSipParticipantJoined({
          roomName,
          wacid,
        })
      return outcome.status === "retry" ? RETRY_RESPONSE : OK_RESPONSE
    }
    case "egress_ended": {
      const roomName = event.egressInfo?.roomName
      if (!roomName) {
        return OK_RESPONSE
      }
      const file = event.egressInfo?.fileResults?.[0]
      const outcome = await whatsappCallWebhookService.handleEgressEnded({
        roomName,
        filename: file?.filename,
        sizeBytes: file?.size ? Number(file.size) : undefined,
      })
      return outcome.status === "retry" ? RETRY_RESPONSE : OK_RESPONSE
    }
    case "room_finished": {
      if (event.room?.name) {
        await whatsappCallWebhookService.handleRoomFinished(event.room.name)
      }
      return OK_RESPONSE
    }
    default:
      return OK_RESPONSE
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!whatsappLivekitService.isInAppCallingConfigured()) {
    return NextResponse.json({ error: "not configured" }, { status: 404 })
  }

  const authorization = request.headers.get("authorization")
  if (!authorization) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  let event: LivekitEvent
  try {
    const body = await request.text()
    event = await whatsappLivekitService.receiveWebhook(body, authorization)
  } catch (error) {
    logger.warn({ err: error }, "LiveKit webhook signature rejected")
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  try {
    return await dispatchEvent(event)
  } catch (error) {
    // A thrown handler is an unexpected fault (not a durable-handoff miss,
    // which returns `retry` explicitly). ACK so LiveKit's retry budget is
    // saved; the fault is observable in logs.
    logger.error({ err: error, event: event.event }, "LiveKit webhook failed")
    return OK_RESPONSE
  }
}
