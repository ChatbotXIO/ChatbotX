import { describe, expect, test, vi } from "vitest"
import {
  parseRecordingFilePath,
  RECORDING_SWEEP_MIN_AGE_MS,
  sweepRecordingFiles,
} from "../src/freeswitch/recording-sweep"

const file = (
  overrides: Partial<{
    path: string
    uuid: string
    workspaceId: string
    mtimeMs: number
  }>,
) => ({
  path: "/recordings/wa/ws-1/uuid-1.ogg",
  uuid: "uuid-1",
  workspaceId: "ws-1",
  mtimeMs: 0,
  ...overrides,
})

describe("parseRecordingFilePath", () => {
  test("parses workspaceId and uuid out of the dialplan's recording path", () => {
    expect(
      parseRecordingFilePath("/var/freeswitch/recordings/wa/ws-42/abc-123.ogg"),
    ).toEqual({ workspaceId: "ws-42", uuid: "abc-123" })
  })

  test("returns null for a path that doesn't match the expected shape", () => {
    expect(
      parseRecordingFilePath("/var/freeswitch/recordings/other.ogg"),
    ).toBeNull()
  })
})

describe("sweepRecordingFiles", () => {
  const now = 1_000_000

  test("enqueues a file whose uuid is not live and old enough", async () => {
    const enqueueUpload = vi.fn().mockResolvedValue(undefined)
    const result = await sweepRecordingFiles({
      listFiles: async () => [
        file({ mtimeMs: now - RECORDING_SWEEP_MIN_AGE_MS - 1 }),
      ],
      isLiveUuid: () => false,
      now: () => now,
      enqueueUpload,
    })

    expect(result.enqueued).toBe(1)
    expect(enqueueUpload).toHaveBeenCalledOnce()
  })

  test("skips a file whose channel is still live", async () => {
    const enqueueUpload = vi.fn()
    const result = await sweepRecordingFiles({
      listFiles: async () => [
        file({ mtimeMs: now - RECORDING_SWEEP_MIN_AGE_MS - 1 }),
      ],
      isLiveUuid: () => true,
      now: () => now,
      enqueueUpload,
    })

    expect(result.enqueued).toBe(0)
    expect(enqueueUpload).not.toHaveBeenCalled()
  })

  test("skips a file that hasn't aged past the minimum yet", async () => {
    const enqueueUpload = vi.fn()
    const result = await sweepRecordingFiles({
      listFiles: async () => [file({ mtimeMs: now - 1000 })],
      isLiveUuid: () => false,
      now: () => now,
      enqueueUpload,
    })

    expect(result.enqueued).toBe(0)
    expect(enqueueUpload).not.toHaveBeenCalled()
  })

  test("a duplicate of a RECORD_STOP-originated job is expected to be a BullMQ no-op via the shared jobId — this sweep only decides WHETHER to enqueue", async () => {
    const enqueueUpload = vi.fn().mockResolvedValue(undefined)
    await sweepRecordingFiles({
      listFiles: async () => [
        file({
          uuid: "uuid-dup",
          mtimeMs: now - RECORDING_SWEEP_MIN_AGE_MS - 1,
        }),
      ],
      isLiveUuid: () => false,
      now: () => now,
      enqueueUpload,
    })
    expect(enqueueUpload).toHaveBeenCalledWith(
      expect.objectContaining({ uuid: "uuid-dup" }),
    )
  })
})
