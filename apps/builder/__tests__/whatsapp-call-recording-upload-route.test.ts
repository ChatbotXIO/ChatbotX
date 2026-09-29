// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  getCurrentUserId,
  assertCurrentUserCanAccessChatbot,
  findById,
  findByInboxIdForWorkspace,
  findWorkspaceById,
  uploadRecording,
  integrationQueueAdd,
  loggerError,
  checkWorkspaceOwnerAccess,
} = vi.hoisted(() => ({
  getCurrentUserId: vi.fn(),
  assertCurrentUserCanAccessChatbot: vi.fn(),
  findById: vi.fn(),
  findByInboxIdForWorkspace: vi.fn(),
  findWorkspaceById: vi.fn(),
  uploadRecording: vi.fn(),
  integrationQueueAdd: vi.fn(),
  loggerError: vi.fn(),
  checkWorkspaceOwnerAccess: vi.fn(),
}))

vi.mock("@chatbotx.io/business", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@chatbotx.io/business")>()
  return {
    ...original,
    callRecordingService: { uploadRecording },
    workspaceService: { findById: findWorkspaceById },
  }
})

vi.mock("@chatbotx.io/business/errors", () => ({
  ChatbotXException: class ChatbotXException extends Error {
    httpStatusCode = 403
  },
}))

vi.mock(
  "@/lib/workspace/authorize-workspace-access",
  async (importOriginal) => {
    const original =
      await importOriginal<
        typeof import("@/lib/workspace/authorize-workspace-access")
      >()
    return {
      ...original,
      checkWorkspaceOwnerAccess,
    }
  },
)

vi.mock("@chatbotx.io/database/repositories", () => ({
  whatsappCallRepository: { findById },
  integrationWhatsappRepository: { findByInboxIdForWorkspace },
}))

vi.mock("@chatbotx.io/worker-config", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@chatbotx.io/worker-config")>()
  return {
    ...original,
    integrationQueue: { add: integrationQueueAdd },
  }
})

vi.mock("@/lib/auth/utils", () => ({
  getCurrentUserId,
  assertCurrentUserCanAccessChatbot,
}))

vi.mock("@/lib/log", () => ({
  logger: { error: loggerError, warn: vi.fn(), info: vi.fn() },
}))

const { POST } = await import("../src/app/api/whatsapp-call-recording/route")

const buildRequest = (
  fields: Record<string, string | Blob>,
  headers?: Record<string, string>,
) => {
  const formData = new FormData()
  for (const [key, value] of Object.entries(fields)) {
    formData.append(key, value)
  }
  const request = new Request("http://localhost/api/whatsapp-call-recording", {
    method: "POST",
    body: formData,
    // Default headers describe a legitimate same-origin request (real
    // browser traffic always carries Host, and `Origin` on a POST) so
    // tests that don't care about the same-site check aren't accidentally
    // exercising its "nothing verifiable" fail-closed branch.
    headers: { host: "localhost", origin: "http://localhost", ...headers },
  })
  return request as never
}

const audioBlob = () => new Blob([new Uint8Array([1, 2, 3])])

const callRow = {
  id: "call-1",
  workspaceId: "ws-1",
  inboxId: "inbox-1",
  wacid: "wacid-1",
  attemptId: null as string | null,
  answeredByUserId: "user-1",
}

describe("POST /api/whatsapp-call-recording", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getCurrentUserId.mockResolvedValue("user-1")
    assertCurrentUserCanAccessChatbot.mockResolvedValue(undefined)
    findById.mockResolvedValue(callRow)
    findWorkspaceById.mockResolvedValue({
      id: "ws-1",
      ownerId: "owner-1",
      scheduledDeletionAt: null,
    })
    checkWorkspaceOwnerAccess.mockResolvedValue(null)
    findByInboxIdForWorkspace.mockResolvedValue({
      id: "integration-1",
      callRecordingEnabled: true,
      callRecordingMode: "browserWhisper",
    })
    uploadRecording.mockResolvedValue({
      recordingPath: "space/ws-1/calls/call-1.webm",
    })
  })

  test("rejects a cross-site request", async () => {
    const response = await POST(
      buildRequest(
        {
          whatsappCallId: "call-1",
          contentType: "audio/webm",
          audio: audioBlob(),
        },
        { "sec-fetch-site": "cross-site" },
      ),
    )

    expect(response.status).toBe(403)
    expect(uploadRecording).not.toHaveBeenCalled()
  })

  test("accepts a same-origin request", async () => {
    const response = await POST(
      buildRequest(
        {
          whatsappCallId: "call-1",
          contentType: "audio/webm",
          audio: audioBlob(),
        },
        { "sec-fetch-site": "same-origin" },
      ),
    )

    expect(response.status).toBe(200)
    expect(uploadRecording).toHaveBeenCalled()
  })

  test("rejects an unauthenticated caller", async () => {
    getCurrentUserId.mockResolvedValue(null)

    const response = await POST(
      buildRequest({
        whatsappCallId: "call-1",
        contentType: "audio/webm",
        audio: audioBlob(),
      }),
    )

    expect(response.status).toBe(401)
    expect(uploadRecording).not.toHaveBeenCalled()
  })

  test("authorized happy path: uploads and enqueues the shared recording-ready job", async () => {
    const response = await POST(
      buildRequest({
        whatsappCallId: "call-1",
        contentType: "audio/webm",
        audio: audioBlob(),
      }),
    )

    expect(response.status).toBe(200)
    expect(assertCurrentUserCanAccessChatbot).toHaveBeenCalledWith("ws-1")
    expect(uploadRecording).toHaveBeenCalledWith({
      callId: "call-1",
      workspaceId: "ws-1",
      body: expect.any(Uint8Array),
      contentType: "audio/webm",
    })
    expect(integrationQueueAdd).toHaveBeenCalledWith(
      "whatsappCallRecordingReady",
      expect.objectContaining({
        type: "whatsappCallRecordingReady",
        data: expect.objectContaining({
          callId: "call-1",
          workspaceId: "ws-1",
          recordingPath: "space/ws-1/calls/call-1.webm",
          mimeType: "audio/webm",
          correlationId: "wacid-1",
        }),
      }),
      { jobId: "rec-ready-call-1" },
    )
  })

  test("rejects when the caller is not the agent who answered the call", async () => {
    findById.mockResolvedValue({ ...callRow, answeredByUserId: "other-user" })

    const response = await POST(
      buildRequest({
        whatsappCallId: "call-1",
        contentType: "audio/webm",
        audio: audioBlob(),
      }),
    )

    expect(response.status).toBe(403)
    expect(uploadRecording).not.toHaveBeenCalled()
    expect(integrationQueueAdd).not.toHaveBeenCalled()
  })

  test("rejects when call recording is disabled on the integration", async () => {
    findByInboxIdForWorkspace.mockResolvedValue({
      id: "integration-1",
      callRecordingEnabled: false,
      callRecordingMode: "browserWhisper",
    })

    const response = await POST(
      buildRequest({
        whatsappCallId: "call-1",
        contentType: "audio/webm",
        audio: audioBlob(),
      }),
    )

    expect(response.status).toBe(403)
    expect(uploadRecording).not.toHaveBeenCalled()
  })

  test("rejects a browser upload when the integration's recording mode is metaNative", async () => {
    findByInboxIdForWorkspace.mockResolvedValue({
      id: "integration-1",
      callRecordingEnabled: true,
      callRecordingMode: "metaNative",
    })

    const response = await POST(
      buildRequest({
        whatsappCallId: "call-1",
        contentType: "audio/webm",
        audio: audioBlob(),
      }),
    )

    expect(response.status).toBe(403)
    expect(uploadRecording).not.toHaveBeenCalled()
  })

  test("rejects a cross-workspace membership check", async () => {
    assertCurrentUserCanAccessChatbot.mockRejectedValue(
      new (await import("@chatbotx.io/business/errors")).ChatbotXException(
        "not a member",
      ),
    )

    const response = await POST(
      buildRequest({
        whatsappCallId: "call-1",
        contentType: "audio/webm",
        audio: audioBlob(),
      }),
    )

    expect(response.status).toBe(403)
    expect(uploadRecording).not.toHaveBeenCalled()
  })

  test("rejects a blocked owner (trial-expired) workspace and never enqueues the job", async () => {
    checkWorkspaceOwnerAccess.mockResolvedValue("trialExpired")

    const response = await POST(
      buildRequest({
        whatsappCallId: "call-1",
        contentType: "audio/webm",
        audio: audioBlob(),
      }),
    )

    expect(response.status).toBe(403)
    expect(checkWorkspaceOwnerAccess).toHaveBeenCalledWith({
      ownerId: "owner-1",
    })
    expect(uploadRecording).not.toHaveBeenCalled()
    expect(integrationQueueAdd).not.toHaveBeenCalled()
  })

  test("rejects a workspace scheduled for deletion and never enqueues the job", async () => {
    findWorkspaceById.mockResolvedValue({
      id: "ws-1",
      ownerId: "owner-1",
      scheduledDeletionAt: new Date().toISOString(),
    })

    const response = await POST(
      buildRequest({
        whatsappCallId: "call-1",
        contentType: "audio/webm",
        audio: audioBlob(),
      }),
    )

    expect(response.status).toBe(403)
    expect(uploadRecording).not.toHaveBeenCalled()
    expect(integrationQueueAdd).not.toHaveBeenCalled()
  })

  test("rejects a disallowed mime type", async () => {
    const response = await POST(
      buildRequest({
        whatsappCallId: "call-1",
        contentType: "video/mp4",
        audio: audioBlob(),
      }),
    )

    expect(response.status).toBe(400)
    expect(uploadRecording).not.toHaveBeenCalled()
  })

  test("rejects a missing call row", async () => {
    findById.mockResolvedValue(undefined)

    const response = await POST(
      buildRequest({
        whatsappCallId: "call-1",
        contentType: "audio/webm",
        audio: audioBlob(),
      }),
    )

    expect(response.status).toBe(404)
    expect(uploadRecording).not.toHaveBeenCalled()
  })

  test("rejects a missing integration", async () => {
    findByInboxIdForWorkspace.mockResolvedValue(null)

    const response = await POST(
      buildRequest({
        whatsappCallId: "call-1",
        contentType: "audio/webm",
        audio: audioBlob(),
      }),
    )

    expect(response.status).toBe(404)
    expect(uploadRecording).not.toHaveBeenCalled()
  })

  test("rejects a malformed request missing required fields", async () => {
    const response = await POST(
      buildRequest({ whatsappCallId: "call-1", contentType: "audio/webm" }),
    )

    expect(response.status).toBe(400)
    expect(uploadRecording).not.toHaveBeenCalled()
  })
})
