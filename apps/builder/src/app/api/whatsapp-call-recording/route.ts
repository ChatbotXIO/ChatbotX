import {
  callRecordingService,
  isAllowedRecordingContentType,
  isWorkspaceScheduledForDeletion,
  workspaceService,
} from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import {
  integrationWhatsappRepository,
  whatsappCallRepository,
} from "@chatbotx.io/database/repositories"
import {
  IntegrationJobAction,
  integrationQueue,
  whatsappCallRecordingReadyJobId,
} from "@chatbotx.io/worker-config"
import { type NextRequest, NextResponse } from "next/server"
import {
  assertCurrentUserCanAccessChatbot,
  getCurrentUserId,
} from "@/lib/auth/utils"
import { serverErrorHandler } from "@/lib/errors/server-handler"
import { isCrossSiteRequest } from "@/lib/http/same-site-request"
import { logger } from "@/lib/log"
import {
  checkWorkspaceOwnerAccess,
  workspaceAccessDenialException,
} from "@/lib/workspace/authorize-workspace-access"

/**
 * Upper bound on a browser-recorded VoIP call upload — generous enough for a
 * long call at a modest bitrate, small enough a single POST can never turn into
 * an unbounded read.
 */
const MAX_RECORDING_UPLOAD_BYTES = 100 * 1024 * 1024

/**
 * A route handler, not a server action, because the payload is a large binary
 * multipart body. Only the agent who answered this call may upload its
 * recording, and only when callRecordingMode is "browserWhisper" — under the
 * default metaNative mode Meta already records server-side, so a browser
 * upload here would double-record it.
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

    const formData = await req.formData()
    const whatsappCallId = formData.get("whatsappCallId")
    const contentType = formData.get("contentType")
    const audio = formData.get("audio")

    if (
      typeof whatsappCallId !== "string" ||
      whatsappCallId.length === 0 ||
      typeof contentType !== "string" ||
      !(audio instanceof Blob)
    ) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    if (!isAllowedRecordingContentType(contentType)) {
      return NextResponse.json(
        { error: "Unsupported audio format" },
        { status: 400 },
      )
    }

    if (audio.size === 0 || audio.size > MAX_RECORDING_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: "Recording too large" },
        { status: 400 },
      )
    }

    const call = await whatsappCallRepository.findById(whatsappCallId)
    if (!call) {
      return NextResponse.json({ error: "Call not found" }, { status: 404 })
    }

    // Membership check, mirroring api/presigned-upload — thrown as a
    // ChatbotXException and mapped to a 4xx by serverErrorHandler below.
    await assertCurrentUserCanAccessChatbot(call.workspaceId)

    // Apply the same owner-access gate workspaceActionClient uses, rather than
    // the allow-expired variant the read-only recording/transcript actions use
    // — this route performs a new write and enqueues the paid Meta-Whisper
    // transcription job, so a trial-expired or blocked owner must not be able
    // to trigger it.
    const workspace = await workspaceService.findById({
      id: call.workspaceId,
    })
    if (isWorkspaceScheduledForDeletion(workspace)) {
      throw new ChatbotXException(
        "Workspace deletion scheduled",
        "workspaceScheduledDeletion",
        403,
      )
    }
    const ownerAccessDenialReason = await checkWorkspaceOwnerAccess({
      ownerId: workspace.ownerId,
    })
    if (ownerAccessDenialReason) {
      throw workspaceAccessDenialException(ownerAccessDenialReason)
    }

    // Pure read with zero business logic — allowed to call the repository
    // directly from the app layer.
    const integration =
      await integrationWhatsappRepository.findByInboxIdForWorkspace({
        workspaceId: call.workspaceId,
        inboxId: call.inboxId,
      })
    if (!integration) {
      return NextResponse.json(
        { error: "Integration not found" },
        { status: 404 },
      )
    }

    // Never trust a client-supplied workspaceId — every check below is derived
    // from the call row and the caller's own session.
    if (call.answeredByUserId !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    if (!integration.callRecordingEnabled) {
      return NextResponse.json(
        { error: "Call recording is disabled" },
        { status: 403 },
      )
    }

    // Defense-in-depth: under metaNative mode Meta records server-side and the
    // browser must never also upload a recording. The client-side gate is the
    // primary defense, but a stray/buggy/old-client upload must still be
    // rejected here rather than silently double-processed.
    if (integration.callRecordingMode !== "browserWhisper") {
      return NextResponse.json(
        { error: "Call recording is not in browser-capture mode" },
        { status: 403 },
      )
    }

    const body = new Uint8Array(await audio.arrayBuffer())
    const { recordingPath } = await callRecordingService.uploadRecording({
      callId: call.id,
      workspaceId: call.workspaceId,
      body,
      contentType,
    })

    await integrationQueue.add(
      IntegrationJobAction.whatsappCallRecordingReady,
      {
        type: IntegrationJobAction.whatsappCallRecordingReady,
        data: {
          callId: call.id,
          workspaceId: call.workspaceId,
          recordingPath,
          mimeType: contentType,
          sizeBytes: audio.size,
          correlationId: call.wacid ?? call.attemptId ?? undefined,
        },
      },
      { jobId: whatsappCallRecordingReadyJobId(call.id) },
    )

    return NextResponse.json({ ok: true })
  } catch (error) {
    if (!(error instanceof ChatbotXException)) {
      logger.error({ err: error }, "WhatsApp VoIP call recording upload failed")
    }
    return serverErrorHandler(error)
  }
}
