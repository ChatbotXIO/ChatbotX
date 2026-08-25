import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  attachLivekitRoom: vi.fn(),
  findByLivekitRoomName: vi.fn(),
  claimRecordingSlot: vi.fn(),
  releaseRecordingSlot: vi.fn(),
  isCallRecordingEnabledForInbox: vi.fn(),
  contactInboxFindBy: vi.fn(),
  contactFindById: vi.fn(),
  broadcast: vi.fn(),
  queueAdd: vi.fn(),
  buildCallRecordingPath: vi.fn(() => "public/space/ws-1/calls/wacid.ABC.ogg"),
  startCallRecording: vi.fn(),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  whatsappCallRepository: {
    attachLivekitRoom: mocks.attachLivekitRoom,
    findByLivekitRoomName: mocks.findByLivekitRoomName,
    claimRecordingSlot: mocks.claimRecordingSlot,
    releaseRecordingSlot: mocks.releaseRecordingSlot,
  },
  integrationWhatsappRepository: {
    isCallRecordingEnabledForInbox: mocks.isCallRecordingEnabledForInbox,
  },
}))

vi.mock("@chatbotx.io/worker-config", async () => {
  const actual = await vi.importActual<
    typeof import("@chatbotx.io/worker-config")
  >("@chatbotx.io/worker-config")
  return { ...actual, integrationQueue: { add: mocks.queueAdd } }
})

vi.mock("../src/contact-inbox/service", () => ({
  contactInboxService: { findBy: mocks.contactInboxFindBy },
}))
vi.mock("../src/contact/service", () => ({
  contactService: { findById: mocks.contactFindById },
}))
vi.mock("../src/platform/realtime-broadcast", () => ({
  broadcastToWorkspaceParty: mocks.broadcast,
}))
vi.mock("../src/logger", () => ({ logger: mocks.logger }))
vi.mock("../src/whatsapp-call/livekit-service", () => ({
  whatsappLivekitService: {
    buildCallRecordingPath: mocks.buildCallRecordingPath,
    startCallRecording: mocks.startCallRecording,
  },
}))

const { whatsappCallWebhookService } = await import(
  "../src/whatsapp-call/webhook-service"
)

const call = {
  wacid: "wacid.ABC",
  workspaceId: "ws-1",
  inboxId: "inbox-1",
  contactInboxId: "ci-1",
  conversationId: "conv-1",
}

describe("whatsappCallWebhookService.handleSipParticipantJoined", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.attachLivekitRoom.mockResolvedValue(call)
    mocks.isCallRecordingEnabledForInbox.mockResolvedValue(false)
    mocks.contactInboxFindBy.mockResolvedValue({
      id: "ci-1",
      contactId: "contact-1",
    })
    mocks.contactFindById.mockResolvedValue({ firstName: "Kerry" })
  })

  test("correlates the room and broadcasts the ringing banner", async () => {
    const outcome = await whatsappCallWebhookService.handleSipParticipantJoined(
      { roomName: "room-1", wacid: "wacid.ABC" },
    )

    expect(outcome).toEqual({ status: "handled" })
    expect(mocks.attachLivekitRoom).toHaveBeenCalledWith({
      wacid: "wacid.ABC",
      livekitRoomName: "room-1",
    })
    expect(mocks.broadcast).toHaveBeenCalledWith(
      "ws-1",
      expect.objectContaining({
        data: expect.objectContaining({
          wacid: "wacid.ABC",
          contactName: "Kerry",
        }),
      }),
    )
  })

  test("asks for redelivery when the call row does not exist yet", async () => {
    mocks.attachLivekitRoom.mockResolvedValue(undefined)

    const outcome = await whatsappCallWebhookService.handleSipParticipantJoined(
      { roomName: "room-1", wacid: "wacid.MISSING" },
    )

    expect(outcome).toEqual({ status: "retry" })
    expect(mocks.broadcast).not.toHaveBeenCalled()
  })

  test("claims the slot then starts egress when recording is enabled", async () => {
    mocks.isCallRecordingEnabledForInbox.mockResolvedValue(true)
    mocks.claimRecordingSlot.mockResolvedValue(call)

    await whatsappCallWebhookService.handleSipParticipantJoined({
      roomName: "room-1",
      wacid: "wacid.ABC",
    })

    expect(mocks.claimRecordingSlot).toHaveBeenCalledWith({
      wacid: "wacid.ABC",
      recordingPath: "public/space/ws-1/calls/wacid.ABC.ogg",
    })
    expect(mocks.startCallRecording).toHaveBeenCalled()
    expect(mocks.releaseRecordingSlot).not.toHaveBeenCalled()
  })

  test("does not double-start egress when the slot was already claimed", async () => {
    mocks.isCallRecordingEnabledForInbox.mockResolvedValue(true)
    mocks.claimRecordingSlot.mockResolvedValue(undefined)

    await whatsappCallWebhookService.handleSipParticipantJoined({
      roomName: "room-1",
      wacid: "wacid.ABC",
    })

    expect(mocks.startCallRecording).not.toHaveBeenCalled()
  })

  test("releases the slot when the egress fails to start", async () => {
    mocks.isCallRecordingEnabledForInbox.mockResolvedValue(true)
    mocks.claimRecordingSlot.mockResolvedValue(call)
    mocks.startCallRecording.mockRejectedValue(new Error("egress down"))

    await whatsappCallWebhookService.handleSipParticipantJoined({
      roomName: "room-1",
      wacid: "wacid.ABC",
    })

    expect(mocks.releaseRecordingSlot).toHaveBeenCalledWith({
      wacid: "wacid.ABC",
    })
  })
})

describe("whatsappCallWebhookService.handleEgressEnded", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.findByLivekitRoomName.mockResolvedValue(call)
  })

  test("enqueues the recording-ready job", async () => {
    const outcome = await whatsappCallWebhookService.handleEgressEnded({
      roomName: "room-1",
      filename: "public/space/ws-1/calls/wacid.ABC.ogg",
      sizeBytes: 1234,
    })

    expect(outcome).toEqual({ status: "handled" })
    expect(mocks.queueAdd).toHaveBeenCalledWith(
      "whatsappCallRecordingReady",
      expect.objectContaining({
        data: expect.objectContaining({ wacid: "wacid.ABC" }),
      }),
      { jobId: "wa-call-rec-wacid.ABC" },
    )
  })

  test("asks for redelivery when the queue handoff fails", async () => {
    mocks.queueAdd.mockRejectedValue(new Error("redis down"))

    const outcome = await whatsappCallWebhookService.handleEgressEnded({
      roomName: "room-1",
      filename: "file.ogg",
    })

    expect(outcome).toEqual({ status: "retry" })
  })

  test("no-ops (handled) when no call matches the room", async () => {
    mocks.findByLivekitRoomName.mockResolvedValue(undefined)

    const outcome = await whatsappCallWebhookService.handleEgressEnded({
      roomName: "unknown",
      filename: "file.ogg",
    })

    expect(outcome).toEqual({ status: "handled" })
    expect(mocks.queueAdd).not.toHaveBeenCalled()
  })
})

describe("whatsappCallWebhookService.handleRoomFinished", () => {
  beforeEach(() => vi.clearAllMocks())

  test("broadcasts the call-ended event", async () => {
    mocks.findByLivekitRoomName.mockResolvedValue(call)

    await whatsappCallWebhookService.handleRoomFinished("room-1")

    expect(mocks.broadcast).toHaveBeenCalledWith(
      "ws-1",
      expect.objectContaining({
        data: { wacid: "wacid.ABC", roomName: "room-1" },
      }),
    )
  })

  test("no-ops when no call matches the room", async () => {
    mocks.findByLivekitRoomName.mockResolvedValue(undefined)

    await whatsappCallWebhookService.handleRoomFinished("unknown")

    expect(mocks.broadcast).not.toHaveBeenCalled()
  })
})
