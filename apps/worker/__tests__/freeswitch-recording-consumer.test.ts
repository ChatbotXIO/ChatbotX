import { beforeEach, describe, expect, test, vi } from "vitest"

type CapturedWorker = {
  queueName: string
  processor: (job: { data: unknown }) => Promise<unknown>
}

const {
  workerState,
  findByFreeswitchUuidMock,
  ensureCallRowMock,
  uploadRecordingMock,
  findByIdForWorkspaceMock,
  integrationQueueAddMock,
  readFileMock,
  unlinkMock,
  renameMock,
  resolveParticipantsMock,
  blockedOwnerGuardMock,
} = vi.hoisted(() => ({
  blockedOwnerGuardMock: vi.fn(
    async (_workspaceId: string, run: () => Promise<void>) => await run(),
  ),
  workerState: { captured: [] as CapturedWorker[] },
  findByFreeswitchUuidMock: vi.fn(),
  ensureCallRowMock: vi.fn(),
  uploadRecordingMock: vi.fn(),
  findByIdForWorkspaceMock: vi.fn(),
  integrationQueueAddMock: vi.fn(),
  readFileMock: vi.fn(),
  unlinkMock: vi.fn(),
  renameMock: vi.fn(),
  resolveParticipantsMock: vi.fn(),
}))

vi.mock("bullmq", () => ({
  Worker: class {
    constructor(queueName: string, processor: CapturedWorker["processor"]) {
      workerState.captured.push({ queueName, processor })
    }
    close = vi.fn()
  },
}))

vi.mock("node:fs/promises", () => ({
  readFile: readFileMock,
  unlink: unlinkMock,
  rename: renameMock,
}))

vi.mock("@chatbotx.io/business", () => ({
  callRecordingService: { uploadRecording: uploadRecordingMock },
  ensureCallRow: ensureCallRowMock,
  withBlockedOwnerGuard: blockedOwnerGuardMock,
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  whatsappCallRepository: { findByFreeswitchUuid: findByFreeswitchUuidMock },
  integrationWhatsappRepository: {
    findByIdForWorkspace: findByIdForWorkspaceMock,
  },
}))

vi.mock("@chatbotx.io/worker-config", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@chatbotx.io/worker-config")>()
  return {
    ...original,
    getRedisConnection: () => ({}),
    integrationQueue: { add: integrationQueueAddMock },
  }
})

vi.mock(
  "../src/integration/handlers/shared/whatsapp-call-participants",
  () => ({ resolveFreeswitchCallParticipants: resolveParticipantsMock }),
)

vi.mock("../src/lib/logger", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}))

const { createRecordingConsumer, toLocalRecordingPath } = await import(
  "../src/freeswitch/recording-consumer"
)

const RECORDINGS_DIR = "/recordings"
const VOLUME = { localDir: RECORDINGS_DIR, freeswitchDir: RECORDINGS_DIR }
const jobData = {
  channel: "whatsapp" as const,
  nodeId: "default",
  workspaceId: "ws-1",
  integrationId: "int-1",
  rootUuid: "uuid-1",
  path: "/recordings/wa/ws-1/uuid-1.ogg",
}
const callRow = {
  id: "call-1",
  workspaceId: "ws-1",
  wacid: null,
  attemptId: "att-1",
}

const process = () => {
  createRecordingConsumer("default", VOLUME)
  return workerState.captured[0]?.processor({ data: jobData })
}

describe("createRecordingConsumer", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    workerState.captured = []
    findByIdForWorkspaceMock.mockResolvedValue({ id: "int-1" })
    readFileMock.mockResolvedValue(Buffer.from("ogg"))
    uploadRecordingMock.mockResolvedValue({
      recordingPath: "space/ws-1/calls/call-1.ogg",
    })
    unlinkMock.mockResolvedValue(undefined)
    renameMock.mockResolvedValue(undefined)
  })

  test("consumes the node-scoped recordings queue", () => {
    createRecordingConsumer("node-b", VOLUME)
    expect(workerState.captured[0]?.queueName).toBe(
      "freeswitch-recordings:node-b",
    )
  })

  test("uploads an existing call's file, deletes it and chains the ready job by callId", async () => {
    findByFreeswitchUuidMock.mockResolvedValue(callRow)

    await process()

    expect(ensureCallRowMock).not.toHaveBeenCalled()
    expect(uploadRecordingMock).toHaveBeenCalledWith({
      callId: "call-1",
      workspaceId: "ws-1",
      body: expect.any(Uint8Array),
    })
    expect(unlinkMock).toHaveBeenCalledWith(jobData.path)
    // The durable post-processing job is chained BEFORE the local delete.
    expect(integrationQueueAddMock.mock.invocationCallOrder[0]).toBeLessThan(
      unlinkMock.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
    )
    expect(integrationQueueAddMock).toHaveBeenCalledWith(
      "whatsappCallRecordingReady",
      expect.objectContaining({
        data: expect.objectContaining({
          callId: "call-1",
          recordingPath: "space/ws-1/calls/call-1.ogg",
          correlationId: "att-1",
        }),
      }),
      { jobId: "rec-ready-call-1" },
    )
  })

  test("upload-first race: creates the row through the shared resolver when no row exists yet", async () => {
    findByFreeswitchUuidMock.mockResolvedValue(undefined)
    ensureCallRowMock.mockImplementation(
      async (input: { resolveParticipants: (i: unknown) => unknown }) => {
        await input.resolveParticipants({
          integrationId: "int-1",
          from: "+1",
          to: "+2",
        })
        return callRow
      },
    )

    await process()

    expect(ensureCallRowMock).toHaveBeenCalledWith(
      expect.objectContaining({ rootUuid: "uuid-1", integrationId: "int-1" }),
    )
    expect(resolveParticipantsMock).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "ws-1", integrationId: "int-1" }),
    )
    expect(uploadRecordingMock).toHaveBeenCalledOnce()
  })

  test("throws (so BullMQ retries) when the row cannot be created yet, keeping the file", async () => {
    findByFreeswitchUuidMock.mockResolvedValue(undefined)
    ensureCallRowMock.mockRejectedValue(new Error("participants unresolved"))

    await expect(process()).rejects.toThrow(
      "freeswitch-recording-row-not-ready",
    )
    expect(uploadRecordingMock).not.toHaveBeenCalled()
    expect(unlinkMock).not.toHaveBeenCalled()
    expect(renameMock).not.toHaveBeenCalled()
  })

  test("moves the file to orphans and fails when the integration was deleted", async () => {
    findByFreeswitchUuidMock.mockResolvedValue(callRow)
    findByIdForWorkspaceMock.mockResolvedValue(undefined)

    await expect(process()).rejects.toThrow("freeswitch-recording-orphaned")
    expect(renameMock).toHaveBeenCalledWith(
      jobData.path,
      "/recordings/orphans/uuid-1.ogg",
    )
    expect(uploadRecordingMock).not.toHaveBeenCalled()
  })

  test("runs the upload under the blocked-owner guard and skips everything for a blocked owner", async () => {
    findByFreeswitchUuidMock.mockResolvedValue(callRow)
    blockedOwnerGuardMock.mockImplementationOnce(async () => undefined)

    await process()

    expect(blockedOwnerGuardMock).toHaveBeenCalledWith(
      "ws-1",
      expect.any(Function),
    )
    expect(uploadRecordingMock).not.toHaveBeenCalled()
    expect(unlinkMock).not.toHaveBeenCalled()
  })

  test("keeps the file when the upload itself fails", async () => {
    findByFreeswitchUuidMock.mockResolvedValue(callRow)
    uploadRecordingMock.mockRejectedValue(new Error("s3 down"))

    await expect(process()).rejects.toThrow("s3 down")
    expect(unlinkMock).not.toHaveBeenCalled()
    expect(integrationQueueAddMock).not.toHaveBeenCalled()
  })
})

describe("toLocalRecordingPath", () => {
  const volume = {
    localDir: "/host/data/recordings",
    freeswitchDir: "/recordings",
  }

  test("remaps a FreeSWITCH-side path onto the worker's mount", () => {
    expect(toLocalRecordingPath("/recordings/wa/ws-1/uuid.ogg", volume)).toBe(
      "/host/data/recordings/wa/ws-1/uuid.ogg",
    )
  })

  test("rejects paths outside the FreeSWITCH recordings prefix", () => {
    expect(toLocalRecordingPath("/etc/passwd", volume)).toBeNull()
    expect(toLocalRecordingPath("/recordings-other/x.ogg", volume)).toBeNull()
  })

  test("rejects traversal inside the prefix", () => {
    expect(
      toLocalRecordingPath("/recordings/wa/../../etc/x", volume),
    ).toBeNull()
  })
})
