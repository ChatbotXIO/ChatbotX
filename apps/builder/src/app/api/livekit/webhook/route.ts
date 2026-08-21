import {
  broadcastToWorkspaceParty,
  contactInboxService,
  contactService,
  whatsappLivekitService,
} from "@chatbotx.io/business"
import {
  integrationWhatsappRepository,
  whatsappCallRepository,
} from "@chatbotx.io/database/repositories"
import { RealtimeEventType } from "@chatbotx.io/partysocket-config"
import {
  IntegrationJobAction,
  integrationQueue,
} from "@chatbotx.io/worker-config"
import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"
import { logger } from "@/lib/log"

/**
 * LiveKit server webhooks for in-app WhatsApp calling (beta).
 *
 * - `participant_joined` (SIP participant): correlates the SIP leg to its
 *   WhatsappCall via the `x-wa-meta-wacid` SIP header (exposed as a LiveKit
 *   participant attribute) and broadcasts a ringing event to the workspace.
 * - `egress_ended`: the call recording landed in S3 — hands off to the
 *   worker pipeline (audio message + callRecorded event + transcription).
 * - `room_finished`: dismisses any incoming-call UI.
 *
 * Requests are authenticated with LiveKit's signed Authorization header;
 * everything else is rejected. See docs/whatsapp-calling.md for the LiveKit
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

const handleSipParticipantJoined = async (props: {
  roomName: string
  wacid: string
}): Promise<void> => {
  const call = await whatsappCallRepository.attachLivekitRoom({
    wacid: props.wacid,
    livekitRoomName: props.roomName,
  })
  if (!call) {
    logger.warn(
      { wacid: props.wacid, roomName: props.roomName },
      "LiveKit SIP participant joined for unknown wacid",
    )
    return
  }

  // Auto-recording starts as soon as the SIP leg lands. The DB claim (CAS
  // on recordingPath) is the idempotency gate: LiveKit webhooks are
  // at-least-once, and a redelivered participant_joined must not spin up a
  // second egress racing on the same S3 object.
  const recordingEnabled =
    await integrationWhatsappRepository.isCallRecordingEnabledForInbox({
      workspaceId: call.workspaceId,
      inboxId: call.inboxId,
    })
  if (recordingEnabled) {
    const recordingPath = whatsappLivekitService.buildCallRecordingPath({
      workspaceId: call.workspaceId,
      wacid: call.wacid,
    })
    const claimed = await whatsappCallRepository.claimRecordingSlot({
      wacid: call.wacid,
      recordingPath,
    })
    if (claimed) {
      try {
        await whatsappLivekitService.startCallRecording({
          roomName: props.roomName,
          workspaceId: call.workspaceId,
          wacid: call.wacid,
        })
      } catch (error) {
        // Free the slot so a later delivery can retry the egress.
        await whatsappCallRepository.releaseRecordingSlot({
          wacid: call.wacid,
        })
        logger.error(
          { err: error, wacid: call.wacid },
          "Failed to start call recording egress",
        )
      }
    }
  }

  const contactInbox = await contactInboxService.findBy({
    where: { id: call.contactInboxId },
  })
  const contact = contactInbox
    ? await contactService.findById({
        workspaceId: call.workspaceId,
        id: contactInbox.contactId,
      })
    : undefined

  broadcastToWorkspaceParty(call.workspaceId, {
    eventType: RealtimeEventType.whatsappCallRinging,
    data: {
      wacid: call.wacid,
      roomName: props.roomName,
      conversationId: call.conversationId,
      contactInboxId: call.contactInboxId,
      contactName: contact?.firstName ?? null,
    },
  })
}

const handleEgressEnded = async (props: {
  roomName: string
  filename?: string
  sizeBytes?: number
}): Promise<void> => {
  const call = await whatsappCallRepository.findByLivekitRoomName(
    props.roomName,
  )
  if (!(call && props.filename)) {
    logger.warn(
      { roomName: props.roomName, filename: props.filename },
      "LiveKit egress ended without a matching call/file",
    )
    return
  }

  await integrationQueue.add(
    IntegrationJobAction.whatsappCallRecordingReady,
    {
      type: IntegrationJobAction.whatsappCallRecordingReady,
      data: {
        wacid: call.wacid,
        workspaceId: call.workspaceId,
        recordingPath: props.filename,
        sizeBytes: props.sizeBytes,
      },
    },
    {
      jobId: `wa-call-rec-${call.wacid.replace(/[^a-zA-Z0-9._-]/g, "_")}`,
    },
  )
}

const handleRoomFinished = async (roomName: string): Promise<void> => {
  const call = await whatsappCallRepository.findByLivekitRoomName(roomName)
  if (!call) {
    return
  }
  broadcastToWorkspaceParty(call.workspaceId, {
    eventType: RealtimeEventType.whatsappCallEnded,
    data: { wacid: call.wacid, roomName },
  })
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!whatsappLivekitService.isInAppCallingConfigured()) {
    return NextResponse.json({ error: "not configured" }, { status: 404 })
  }

  const authorization = request.headers.get("authorization")
  if (!authorization) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  let event: Awaited<ReturnType<typeof whatsappLivekitService.receiveWebhook>>
  try {
    const body = await request.text()
    event = await whatsappLivekitService.receiveWebhook(body, authorization)
  } catch (error) {
    logger.warn({ err: error }, "LiveKit webhook signature rejected")
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  try {
    switch (event.event) {
      case "participant_joined": {
        const wacid = readWacidAttribute(event.participant?.attributes)
        const roomName = event.room?.name
        if (wacid && roomName) {
          await handleSipParticipantJoined({ roomName, wacid })
        }
        break
      }
      case "egress_ended": {
        const roomName = event.egressInfo?.roomName
        const file = event.egressInfo?.fileResults?.[0]
        if (roomName) {
          try {
            await handleEgressEnded({
              roomName,
              filename: file?.filename,
              sizeBytes: file?.size ? Number(file.size) : undefined,
            })
          } catch (error) {
            // The queue handoff is the ONLY durable record of the finished
            // recording — a 200 here would make LiveKit stop redelivering
            // and lose it. Redelivery is safe: the BullMQ jobId and the
            // recordedAt CAS deduplicate everything downstream.
            logger.error(
              { err: error, roomName },
              "LiveKit egress handoff failed; requesting redelivery",
            )
            return NextResponse.json({ error: "retry" }, { status: 503 })
          }
        }
        break
      }
      case "room_finished": {
        if (event.room?.name) {
          await handleRoomFinished(event.room.name)
        }
        break
      }
      default:
        break
    }
  } catch (error) {
    // Non-egress events are UI conveniences (ringing banner, dismissal) —
    // failures are logged and the webhook still ACKs so LiveKit's retry
    // budget is saved for deliveries that carry durable state.
    logger.error({ err: error, event: event.event }, "LiveKit webhook failed")
  }

  return NextResponse.json({ ok: true })
}
