import { beforeEach, describe, expect, it, vi } from "vitest"

const { mockAddBulk } = vi.hoisted(() => ({
  mockAddBulk: vi.fn(),
}))

// The avatar backfill jobs are light but high-volume and low-priority, so they
// must be enqueued on the dedicated `low` queue — never the latency-sensitive
// `integration` queue that drives customer replies.
vi.mock("@chatbotx.io/worker-config", () => ({
  LowJobAction: {
    updateContactAvatar: "updateContactAvatar",
    coexistAttachmentDownload: "coexistAttachmentDownload",
  },
  lowQueue: { addBulk: mockAddBulk },
}))

vi.mock("../src/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))

import { enqueueContactAvatarJobs } from "../src/integration/handlers/contact/enqueue-avatar-jobs"

describe("enqueueContactAvatarJobs", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAddBulk.mockResolvedValue(undefined)
  })

  it("enqueues one updateContactAvatar job per contact on the low queue", async () => {
    await enqueueContactAvatarJobs({
      workspaceId: "ws-1",
      contactInboxIds: new Map([
        ["source-a", { contactInboxId: "ci-a" }],
        ["source-b", { contactInboxId: "ci-b" }],
      ]),
    })

    expect(mockAddBulk).toHaveBeenCalledTimes(1)
    const jobs = mockAddBulk.mock.calls[0][0]
    expect(jobs).toHaveLength(2)
    expect(jobs[0]).toMatchObject({
      name: "updateContactAvatar",
      data: {
        type: "updateContactAvatar",
        data: {
          workspaceId: "ws-1",
          contactInboxId: "ci-a",
          sourceId: "source-a",
        },
      },
      opts: { jobId: "update-avatar-ci-a" },
    })
  })

  it("produces jobIds free of the ':' delimiter BullMQ forbids", async () => {
    await enqueueContactAvatarJobs({
      workspaceId: "ws-1",
      contactInboxIds: new Map([["source-a", { contactInboxId: "ci-a" }]]),
    })

    const jobs = mockAddBulk.mock.calls[0][0]
    for (const job of jobs) {
      expect(job.opts.jobId).not.toContain(":")
    }
  })

  it("no-ops without touching the queue when there are no contacts", async () => {
    await enqueueContactAvatarJobs({
      workspaceId: "ws-1",
      contactInboxIds: new Map(),
    })

    expect(mockAddBulk).not.toHaveBeenCalled()
  })

  it("swallows an addBulk failure so the caller's run is never failed", async () => {
    mockAddBulk.mockRejectedValueOnce(new Error("redis down"))

    await expect(
      enqueueContactAvatarJobs({
        workspaceId: "ws-1",
        contactInboxIds: new Map([["source-a", { contactInboxId: "ci-a" }]]),
      }),
    ).resolves.toBeUndefined()
  })
})
