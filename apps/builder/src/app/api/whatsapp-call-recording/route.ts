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
 * long call at a modest bitrate, small enough that a single POST can never
 * turn into an unbounded read (bounded-work invariant).
 */
const MAX_RECORDING_UPLOAD_BYTES = 100 * 1024 * 1024

/**
 * Accepts a browser-recorded WhatsApp call audio blob and feeds it into the
 * shared recording pipeline — `callRecordingService.uploadRecording` for the
 * object-storage write, then the `whatsappCallRecordingReady` integration
 * job, so the downstream activity-message/attach/transcribe logic in
 * `handleWhatsappCallRecordingReady` is never duplicated.
 *
 * A route handler (not a next-safe-action server action) because the
 * payload is a large binary multipart body — server actions in this
 * codebase are reserved for typed JSON-ish mutations, and every other
 * binary upload here (`api/presigned-upload`) is already a route handler.
 *
 * Authorization is entirely server-side and never trusts client flags:
 * - the caller must be signed in and a member of the call's workspace
 *   (mirrors `api/presigned-upload`'s `assertCurrentUserCanAccessChatbot`);
 * - only the agent who actually answered this call
 *   (`call.answeredByUserId === ctx.user.id`) may upload its recording —
 *   this is what stops any other workspace member from overwriting the
 *   recording object, or triggering the (paid) transcription pipeline, for
 *   an arbitrary `callId`;
 * - the integration's `callRecordingEnabled` must be true, AND
 *   `callRecordingMode` must be `"browserWhisper"` — under the default
 *   `metaNative` mode Meta already records the call server-side, so a
 *   browser upload here would double-record it.
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

    // Membership check, mirroring `api/presigned-upload` — thrown as a
    // ChatbotXException and mapped to a 4xx by `serverErrorHandler` below.
    await assertCurrentUserCanAccessChatbot(call.workspaceId)

    // Apply the same owner-access gate `workspaceActionClient` uses
    // (scheduled-deletion + blocked-owner/trial-expired), rather than the
    // `workspaceActionClientAllowExpired` variant that `get-call-recording-
    // url.action.ts` / `get-call-transcript.action.ts` use. Those actions
    // only read an already-existing recording/transcript, so they qualify
    // as "finishing" an in-progress call under the allow-expired
    // convention (AGENTS.md invariant #14). This route instead performs a
    // NEW write (uploads the recording object) and enqueues the
    // Meta-Whisper transcription job, which costs money — so a
    // trial-expired or otherwise blocked owner must not be able to trigger
    // it, same as any other paid mutation gated by `workspaceActionClient`.
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
    // directly from the app layer (AGENTS.md #9).
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

    // Never trust a client-supplied workspaceId — every check below is
    // derived from the call row and the caller's own session.
    if (call.answeredByUserId !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    if (!integration.callRecordingEnabled) {
      return NextResponse.json(
        { error: "Call recording is disabled" },
        { status: 403 },
      )
    }

    // U2 defense-in-depth: under `metaNative` mode Meta records the call
    // server-side and the browser must never ALSO upload a recording — the
    // client-side gate (the browser's own `shouldRecordRef`) is the primary
    // defense, but a stray/buggy/old-client upload must still be rejected
    // here rather than silently accepted and double-processed.
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
