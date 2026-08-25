import {
  integrationWhatsappRepository,
  whatsappCallRepository,
} from "@chatbotx.io/database/repositories"
import { RealtimeEventType } from "@chatbotx.io/partysocket-config"
import {
  IntegrationJobAction,
  integrationQueue,
} from "@chatbotx.io/worker-config"
import { contactService } from "../contact/service"
import { contactInboxService } from "../contact-inbox/service"
import { logger } from "../logger"
import { broadcastToWorkspaceParty } from "../platform/realtime-broadcast"
import { whatsappLivekitService } from "./livekit-service"

/**
 * Outcome of handling one LiveKit webhook event, so the transport layer can
 * decide the HTTP response without knowing the orchestration.
 *
 * - `handled`: done (or a deliberate no-op) — ACK with 200.
 * - `retry`: durable state could not be recorded yet — respond non-2xx so
 *   LiveKit redelivers (its webhooks are at-least-once).
 */
export type LivekitWebhookOutcome = { status: "handled" | "retry" }

const HANDLED: LivekitWebhookOutcome = { status: "handled" }
const RETRY: LivekitWebhookOutcome = { status: "retry" }

const toRecordingJobId = (wacid: string): string =>
  `wa-call-rec-${wacid.replace(/[^a-zA-Z0-9._-]/g, "_")}`

/**
 * Orchestrates LiveKit server webhooks for in-app WhatsApp calling (beta).
 * The route owns transport (signature verification, event-shape parsing, HTTP
 * status); every DB/queue/broadcast side effect lives here so it is reused
 * and unit-tested like the worker call handlers.
 */
class WhatsappCallWebhookService {
  /**
   * A SIP participant joined the call's room: correlate the room to its
   * WhatsappCall, start recording (if enabled), and broadcast the ringing
   * banner. Returns `retry` when the call row does not exist yet — Meta's
   * "connect" webhook (which inserts the row via a queue job) and LiveKit's
   * SIP INVITE are independent paths with no ordering guarantee, so a
   * redelivery lets the row catch up instead of losing the correlation.
   */
  async handleSipParticipantJoined(props: {
    roomName: string
    wacid: string
  }): Promise<LivekitWebhookOutcome> {
    const call = await whatsappCallRepository.attachLivekitRoom({
      wacid: props.wacid,
      livekitRoomName: props.roomName,
    })
    if (!call) {
      logger.warn(
        { wacid: props.wacid, roomName: props.roomName },
        "LiveKit SIP participant joined before the call row existed; will retry",
      )
      return RETRY
    }

    await this.startRecordingIfEnabled({
      workspaceId: call.workspaceId,
      inboxId: call.inboxId,
      wacid: call.wacid,
      roomName: props.roomName,
    })

    const contactInbox = await contactInboxService.findBy({
      where: { id: call.contactInboxId },
    })
    const contact = contactInbox
      ? await contactService.findById({
          workspaceId: call.workspaceId,
          id: contactInbox.contactId,
        })
      : undefined

    await broadcastToWorkspaceParty(call.workspaceId, {
      eventType: RealtimeEventType.whatsappCallRinging,
      data: {
        wacid: call.wacid,
        roomName: props.roomName,
        conversationId: call.conversationId,
        contactInboxId: call.contactInboxId,
        contactName: contact?.firstName ?? null,
      },
    })
    return HANDLED
  }

  /**
   * The recording egress finished and the file is in object storage. Hands
   * off to the worker pipeline; returns `retry` when the durable queue
   * enqueue fails, since that job is the only record of the finished
   * recording (its deterministic jobId makes redelivery safe).
   */
  async handleEgressEnded(props: {
    roomName: string
    filename?: string
    sizeBytes?: number
  }): Promise<LivekitWebhookOutcome> {
    const call = await whatsappCallRepository.findByLivekitRoomName(
      props.roomName,
    )
    if (!(call && props.filename)) {
      logger.warn(
        { roomName: props.roomName, filename: props.filename },
        "LiveKit egress ended without a matching call/file",
      )
      return HANDLED
    }

    try {
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
        { jobId: toRecordingJobId(call.wacid) },
      )
    } catch (error) {
      logger.error(
        { err: error, roomName: props.roomName },
        "LiveKit egress handoff failed; requesting redelivery",
      )
      return RETRY
    }
    return HANDLED
  }

  /** The call's room closed — dismiss any incoming-call UI. Best-effort. */
  async handleRoomFinished(roomName: string): Promise<LivekitWebhookOutcome> {
    const call = await whatsappCallRepository.findByLivekitRoomName(roomName)
    if (!call) {
      return HANDLED
    }
    await broadcastToWorkspaceParty(call.workspaceId, {
      eventType: RealtimeEventType.whatsappCallEnded,
      data: { wacid: call.wacid, roomName },
    })
    return HANDLED
  }

  /**
   * Claims the recording slot (CAS on recordingPath) BEFORE starting egress
   * so an at-least-once redelivery never spins up a second egress racing on
   * the same S3 object; releases the claim if the egress fails to start.
   */
  private async startRecordingIfEnabled(props: {
    workspaceId: string
    inboxId: string
    wacid: string
    roomName: string
  }): Promise<void> {
    const recordingEnabled =
      await integrationWhatsappRepository.isCallRecordingEnabledForInbox({
        workspaceId: props.workspaceId,
        inboxId: props.inboxId,
      })
    if (!recordingEnabled) {
      return
    }

    const recordingPath = whatsappLivekitService.buildCallRecordingPath({
      workspaceId: props.workspaceId,
      wacid: props.wacid,
    })
    const claimed = await whatsappCallRepository.claimRecordingSlot({
      wacid: props.wacid,
      recordingPath,
    })
    if (!claimed) {
      return
    }

    try {
      await whatsappLivekitService.startCallRecording({
        roomName: props.roomName,
        workspaceId: props.workspaceId,
        wacid: props.wacid,
      })
    } catch (error) {
      await whatsappCallRepository.releaseRecordingSlot({ wacid: props.wacid })
      logger.error(
        { err: error, wacid: props.wacid },
        "Failed to start call recording egress",
      )
    }
  }
}

export const whatsappCallWebhookService = new WhatsappCallWebhookService()
