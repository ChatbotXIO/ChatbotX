import { beforeEach, describe, expect, it, vi } from "vitest"

const { mockAddBulk } = vi.hoisted(() => ({
  mockAddBulk: vi.fn(),
}))

// Coexist attachment downloads are light but high-volume and low-priority, so
// they must be enqueued on the dedicated `low` queue — never the
// latency-sensitive `integration` queue that drives customer replies.
vi.mock("@chatbotx.io/worker-config", () => ({
  LowJobAction: {
    coexistAttachmentDownload: "coexistAttachmentDownload",
    updateContactAvatar: "updateContactAvatar",
  },
  lowQueue: { addBulk: mockAddBulk },
}))

import { enqueueAttachmentDownloadJobs } from "../src/integration/handlers/coexist/enqueue-attachment-downloads"

describe("enqueueAttachmentDownloadJobs", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAddBulk.mockResolvedValue(undefined)
  })

  it.each([
    "messenger",
    "whatsapp",
    "instagram",
  ] as const)("routes %s attachment jobs to the low queue with preserved options", async (channel) => {
    await enqueueAttachmentDownloadJobs({
      workspaceId: "ws-1",
      integrationId: "int-1",
      channel,
      attachmentIds: ["a1", "a2"],
    })

    expect(mockAddBulk).toHaveBeenCalledTimes(1)
    const jobs = mockAddBulk.mock.calls[0][0]
    expect(jobs).toHaveLength(2)
    expect(jobs[0]).toEqual({
      name: "coexistAttachmentDownload",
      data: {
        type: "coexistAttachmentDownload",
        data: {
          attachmentId: "a1",
          workspaceId: "ws-1",
          channel,
          integrationId: "int-1",
        },
      },
      opts: {
        jobId: "att-a1",
        attempts: 5,
        backoff: { type: "exponential", delay: 30_000 },
        removeOnComplete: true,
        removeOnFail: { count: 100 },
      },
    })
  })

  it("produces jobIds free of the ':' delimiter BullMQ forbids", async () => {
    await enqueueAttachmentDownloadJobs({
      workspaceId: "ws-1",
      integrationId: "int-1",
      channel: "messenger",
      attachmentIds: ["a1", "a2", "a3"],
    })

    const jobs = mockAddBulk.mock.calls[0][0]
    for (const job of jobs) {
      expect(job.opts.jobId).not.toContain(":")
    }
  })

  it("no-ops without touching the queue when there are no attachments", async () => {
    await enqueueAttachmentDownloadJobs({
      workspaceId: "ws-1",
      integrationId: "int-1",
      channel: "whatsapp",
      attachmentIds: [],
    })

    expect(mockAddBulk).not.toHaveBeenCalled()
  })

  it("propagates an addBulk failure so callers control their own error policy", async () => {
    const failure = new Error("redis down")
    mockAddBulk.mockRejectedValueOnce(failure)

    await expect(
      enqueueAttachmentDownloadJobs({
        workspaceId: "ws-1",
        integrationId: "int-1",
        channel: "instagram",
        attachmentIds: ["a1"],
      }),
    ).rejects.toThrow(failure)
  })
})
