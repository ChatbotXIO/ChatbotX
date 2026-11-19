import { beforeEach, describe, expect, test, vi } from "vitest"

const { mockFindAttribution, mockRecord, mockAdd } = vi.hoisted(() => ({
  mockFindAttribution: vi.fn(),
  mockRecord: vi.fn(),
  mockAdd: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  contactInfoCaptureService: {
    findAttribution: mockFindAttribution,
    record: mockRecord,
  },
  contactInfoCaptureSearchOutcomes: {
    enum: {
      attributed: "attributed",
      none: "none",
      continue: "continue",
    },
  },
  contactInfoCaptureRecordResults: {
    enum: {
      recorded: "recorded",
      alreadyRecorded: "alreadyRecorded",
      workspaceUnavailable: "workspaceUnavailable",
      sourceNotAttributable: "sourceNotAttributable",
      recipientPending: "recipientPending",
      recipientFailed: "recipientFailed",
    },
  },
}))

vi.mock("@chatbotx.io/worker-config", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@chatbotx.io/worker-config")>()),
  contactInfoCaptureQueue: { add: mockAdd },
}))

vi.mock("../src/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

const { processContactInfoCapture } = await import(
  "../src/integration/handlers/contact-info-capture"
)

const CREATED_AT = "2026-11-18T10:00:00.123Z"

const baseData = () => ({
  workspaceId: "ws-1",
  contactId: "contact-1",
  contactInboxId: "ci-1",
  inboxId: "inbox-1",
  conversationId: "conv-1",
  messageId: "msg-1",
  messageCreatedAt: CREATED_AT,
  infoTypes: ["phone" as const],
})

const attributed = {
  outcome: "attributed",
  sourceId: "bc-1",
  sourceType: "broadcast",
  followedFlowId: "flow-1",
}

const cursor = {
  before: { createdAt: "2026-11-18T09:59:00.000000+00", id: "m-9" },
  run: 1,
  windowIndex: 0,
}

const addedJob = (call = 0) => ({
  name: mockAdd.mock.calls[call]?.[0] as string,
  data: mockAdd.mock.calls[call]?.[1] as { data: Record<string, unknown> },
  opts: mockAdd.mock.calls[call]?.[2] as { jobId: string; delay?: number },
})

describe("processContactInfoCapture", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRecord.mockResolvedValue("recorded")
    mockAdd.mockResolvedValue(undefined)
  })

  test("passes the inbound message's exact stored createdAt to the search and the insert", async () => {
    mockFindAttribution.mockResolvedValueOnce(attributed)

    await processContactInfoCapture(baseData())

    const search = mockFindAttribution.mock.calls[0]?.[0]
    expect(search.inboundMessage).toEqual({
      createdAt: new Date(CREATED_AT),
      id: "msg-1",
    })
    expect(search.cursor).toBeUndefined()
    expect(mockRecord).toHaveBeenCalledWith({
      capturedAt: new Date(CREATED_AT),
      contactId: "contact-1",
      contactInboxId: "ci-1",
      conversationId: "conv-1",
      followedFlowId: "flow-1",
      inboxId: "inbox-1",
      infoTypes: ["phone"],
      sourceId: "bc-1",
      sourceType: "broadcast",
      workspaceId: "ws-1",
    })
    expect(mockAdd).not.toHaveBeenCalled()
  })

  test("hands the conversation start to the search as a Date and keeps it on continuation jobs", async () => {
    mockFindAttribution.mockResolvedValueOnce({ outcome: "continue", cursor })

    await processContactInfoCapture({
      ...baseData(),
      conversationCreatedAt: "2026-11-18T09:00:00.000Z",
    })

    expect(
      mockFindAttribution.mock.calls[0]?.[0].conversationCreatedAt,
    ).toEqual(new Date("2026-11-18T09:00:00.000Z"))
    expect(addedJob().data.data.conversationCreatedAt).toBe(
      "2026-11-18T09:00:00.000Z",
    )
  })

  test("a job queued without the conversation start, or with an unparsable one, searches without it", async () => {
    mockFindAttribution.mockResolvedValue({
      outcome: "none",
      reason: "noBotSource",
    })

    await processContactInfoCapture(baseData())
    await processContactInfoCapture({
      ...baseData(),
      conversationCreatedAt: "garbage",
    })

    expect(
      mockFindAttribution.mock.calls[0]?.[0].conversationCreatedAt,
    ).toBeUndefined()
    expect(
      mockFindAttribution.mock.calls[1]?.[0].conversationCreatedAt,
    ).toBeUndefined()
  })

  test("stops without writing or enqueueing when the search decides there is no source", async () => {
    mockFindAttribution.mockResolvedValueOnce({
      outcome: "none",
      reason: "noBotSource",
    })

    await processContactInfoCapture(baseData())

    expect(mockRecord).not.toHaveBeenCalled()
    expect(mockAdd).not.toHaveBeenCalled()
  })

  test("continues with the cursor as the next run, under a deterministic step id", async () => {
    mockFindAttribution.mockResolvedValueOnce({ outcome: "continue", cursor })

    await processContactInfoCapture(baseData())

    expect(mockRecord).not.toHaveBeenCalled()
    const job = addedJob()
    expect(job.opts.jobId).toBe("contact-info-capture-msg-1-s1")
    expect(job.opts.jobId).not.toContain(":")
    expect(job.opts.delay).toBeUndefined()
    expect(job.data.data.cursor).toEqual(cursor)
    expect(job.data.data.messageCreatedAt).toBe(CREATED_AT)
  })

  test("a continuation run resumes the search from the cursor it carries", async () => {
    mockFindAttribution.mockResolvedValueOnce(attributed)

    await processContactInfoCapture({ ...baseData(), cursor })

    expect(mockFindAttribution.mock.calls[0]?.[0].cursor).toEqual(cursor)
  })

  test.each([
    "alreadyRecorded",
    "workspaceUnavailable",
    "sourceNotAttributable",
    "recipientFailed",
  ])("%s ends the capture with nothing to retry", async (result) => {
    mockFindAttribution.mockResolvedValueOnce(attributed)
    mockRecord.mockResolvedValueOnce(result)

    await processContactInfoCapture(baseData())

    expect(mockAdd).not.toHaveBeenCalled()
  })

  test("a pending recipient waits 30 seconds first, keeping the attribution and dropping the cursor", async () => {
    mockFindAttribution.mockResolvedValueOnce(attributed)
    mockRecord.mockResolvedValueOnce("recipientPending")

    await processContactInfoCapture({ ...baseData(), cursor })

    const job = addedJob()
    expect(job.opts).toEqual({
      jobId: "contact-info-capture-msg-1-w1",
      delay: 30_000,
    })
    expect(job.data.data).toMatchObject({
      recipientWaits: 1,
      source: {
        followedFlowId: "flow-1",
        sourceId: "bc-1",
        sourceType: "broadcast",
      },
    })
    expect(job.data.data.cursor).toBeUndefined()
  })

  test.each([
    [1, 5 * 60 * 1000, "w2"],
    [2, 30 * 60 * 1000, "w3"],
  ])("after %i wait(s) the next delay is %i ms", async (waits, delay, step) => {
    mockRecord.mockResolvedValueOnce("recipientPending")

    await processContactInfoCapture({
      ...baseData(),
      recipientWaits: waits,
      source: { sourceId: "bc-1", sourceType: "broadcast" },
    })

    expect(mockFindAttribution).not.toHaveBeenCalled()
    expect(addedJob().opts).toEqual({
      jobId: `contact-info-capture-msg-1-${step}`,
      delay,
    })
  })

  test("gives up after the third wait", async () => {
    mockRecord.mockResolvedValueOnce("recipientPending")

    await processContactInfoCapture({
      ...baseData(),
      recipientWaits: 3,
      source: { sourceId: "bc-1", sourceType: "broadcast" },
    })

    expect(mockAdd).not.toHaveBeenCalled()
  })

  test("a wait job skips the history search and re-checks the stored attribution", async () => {
    await processContactInfoCapture({
      ...baseData(),
      recipientWaits: 1,
      source: {
        followedFlowId: "flow-1",
        sourceId: "bc-1",
        sourceType: "broadcast",
      },
    })

    expect(mockFindAttribution).not.toHaveBeenCalled()
    expect(mockRecord).toHaveBeenCalledWith(
      expect.objectContaining({ sourceId: "bc-1", followedFlowId: "flow-1" }),
    )
  })

  test("a read failure propagates so the job retries", async () => {
    mockFindAttribution.mockRejectedValueOnce(new Error("shard down"))

    await expect(processContactInfoCapture(baseData())).rejects.toThrow(
      "shard down",
    )
    expect(mockAdd).not.toHaveBeenCalled()
  })

  test("an insert failure propagates so the job retries", async () => {
    mockFindAttribution.mockResolvedValueOnce(attributed)
    mockRecord.mockRejectedValueOnce(new Error("deadlock"))

    await expect(processContactInfoCapture(baseData())).rejects.toThrow(
      "deadlock",
    )
  })

  test("a failed enqueue of the next run propagates so the job retries", async () => {
    mockFindAttribution.mockResolvedValueOnce({ outcome: "continue", cursor })
    mockAdd.mockRejectedValueOnce(new Error("redis down"))

    await expect(processContactInfoCapture(baseData())).rejects.toThrow(
      "redis down",
    )
  })

  test("an invalid timestamp is dropped instead of failing every attempt", async () => {
    await processContactInfoCapture({
      ...baseData(),
      messageCreatedAt: "garbage",
    })

    expect(mockFindAttribution).not.toHaveBeenCalled()
    expect(mockRecord).not.toHaveBeenCalled()
  })

  test("a retried run enqueues the same job id, so the duplicate is dropped by BullMQ", async () => {
    mockFindAttribution.mockResolvedValue({ outcome: "continue", cursor })

    await processContactInfoCapture(baseData())
    await processContactInfoCapture(baseData())

    expect(addedJob(0).opts.jobId).toBe(addedJob(1).opts.jobId)
  })
})
