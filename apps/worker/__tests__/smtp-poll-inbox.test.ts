// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest"

const m = vi.hoisted(() => ({
  findForPoll: vi.fn(),
  recordPollSuccess: vi.fn(),
  recordPollFailure: vi.fn(),
  listDueImapInboxes: vi.fn(),
  fetchNewMessages: vi.fn(),
  queueAdd: vi.fn(),
  runExclusive: vi.fn(),
  isLockAcquisitionError: vi.fn(),
  order: [] as string[],
}))

vi.mock("@chatbotx.io/business", () => ({
  integrationSmtpService: {
    findForPoll: m.findForPoll,
    recordPollSuccess: m.recordPollSuccess,
    recordPollFailure: m.recordPollFailure,
    listDueImapInboxes: m.listDueImapInboxes,
  },
}))

vi.mock("@chatbotx.io/integration-smtp/imap", () => ({
  fetchNewMessages: m.fetchNewMessages,
  resolveImapConnection: (
    auth: { username: string; password: string },
    settings: { host: string; port: number; mailbox?: string | null },
  ) => ({ ...settings, username: auth.username, password: auth.password }),
}))

vi.mock("@chatbotx.io/redis", () => ({
  distributedLock: { runExclusive: m.runExclusive },
  isLockAcquisitionError: m.isLockAcquisitionError,
}))

vi.mock("@chatbotx.io/logger", () => ({
  getChildLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}))

vi.mock("@chatbotx.io/worker-config", () => ({
  IntegrationJobAction: {
    incomingMessage: "incomingMessage",
    pollSmtpInbox: "pollSmtpInbox",
  },
  integrationQueue: { add: m.queueAdd },
  buildSmtpImapPollJobId: (id: string) => `smtp-imap-poll-${id}`,
  buildSmtpInboundMessageJobId: (i: {
    inboxId: string
    uidValidity: number
    uid: number
  }) => `smtp-in-${i.inboxId}-${i.uidValidity}-${i.uid}`,
}))

const { pollSmtpInbox } = await import(
  "../src/integration/handlers/smtp/poll-inbox"
)
const { pollSmtpInboxes } = await import(
  "../src/schedule/handlers/poll-smtp-inboxes"
)

const row = {
  id: "smtp-1",
  inboxId: "inbox-1",
  imapEnabled: true,
  imapHost: "imap.gmail.com",
  imapPort: 993,
  imapMailbox: "INBOX",
  imapUidValidity: 100,
  imapLastUid: 10,
  auth: { username: "u", password: "p" },
}
const data = { integrationId: "smtp-1", workspaceId: "ws-1" }

beforeEach(() => {
  vi.clearAllMocks()
  m.order.length = 0
  m.runExclusive.mockImplementation(
    async (props: { fn: () => Promise<unknown> }) => await props.fn(),
  )
  m.isLockAcquisitionError.mockReturnValue(false)
  m.findForPoll.mockResolvedValue(row)
  m.queueAdd.mockImplementation(() => {
    m.order.push("enqueue")
    return Promise.resolve()
  })
  m.recordPollSuccess.mockImplementation(() => {
    m.order.push("cursor")
    return Promise.resolve()
  })
})

describe("pollSmtpInbox", () => {
  it("enqueues each mail as an incomingMessage and advances the cursor only afterwards", async () => {
    m.fetchNewMessages.mockResolvedValue({
      messages: [
        { uid: 11, raw: Buffer.from("one") },
        { uid: 12, raw: Buffer.from("two") },
      ],
      cursor: { uidValidity: 100, lastUid: 12 },
      hasMore: false,
    })

    await pollSmtpInbox(data)

    expect(m.fetchNewMessages).toHaveBeenCalledWith({
      connection: expect.objectContaining({
        host: "imap.gmail.com",
        port: 993,
        mailbox: "INBOX",
      }),
      cursor: { uidValidity: 100, lastUid: 10 },
    })
    expect(m.queueAdd).toHaveBeenNthCalledWith(
      1,
      "incomingMessage",
      {
        type: "incomingMessage",
        data: {
          integrationType: "smtp",
          integrationIdentifier: "inbox-1",
          payload: { raw: Buffer.from("one").toString("base64") },
        },
      },
      expect.objectContaining({ jobId: "smtp-in-inbox-1-100-11" }),
    )
    expect(m.queueAdd.mock.calls[1]?.[2]).toMatchObject({
      jobId: "smtp-in-inbox-1-100-12",
    })
    expect(m.order).toEqual(["enqueue", "enqueue", "cursor"])
    expect(m.recordPollSuccess).toHaveBeenCalledWith({
      id: "smtp-1",
      uidValidity: 100,
      lastUid: 12,
    })
    expect(m.recordPollFailure).not.toHaveBeenCalled()
  })

  it("does not advance the cursor when an enqueue fails, and records a failure", async () => {
    m.fetchNewMessages.mockResolvedValue({
      messages: [
        { uid: 11, raw: Buffer.from("one") },
        { uid: 12, raw: Buffer.from("two") },
      ],
      cursor: { uidValidity: 100, lastUid: 12 },
      hasMore: false,
    })
    m.queueAdd
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("redis down"))

    await pollSmtpInbox(data)

    expect(m.recordPollSuccess).not.toHaveBeenCalled()
    expect(m.recordPollFailure).toHaveBeenCalledWith({
      id: "smtp-1",
      error: "redis down",
    })
  })

  it("records a login failure (back-off) without enqueueing anything", async () => {
    m.fetchNewMessages.mockRejectedValue(new Error("AUTHENTICATIONFAILED"))

    await pollSmtpInbox(data)

    expect(m.queueAdd).not.toHaveBeenCalled()
    expect(m.recordPollSuccess).not.toHaveBeenCalled()
    expect(m.recordPollFailure).toHaveBeenCalledWith({
      id: "smtp-1",
      error: "AUTHENTICATIONFAILED",
    })
  })

  it("persists a re-baselined cursor even when there is no mail", async () => {
    m.fetchNewMessages.mockResolvedValue({
      messages: [],
      cursor: { uidValidity: 200, lastUid: 5 },
      hasMore: false,
    })

    await pollSmtpInbox(data)

    expect(m.queueAdd).not.toHaveBeenCalled()
    expect(m.recordPollSuccess).toHaveBeenCalledWith({
      id: "smtp-1",
      uidValidity: 200,
      lastUid: 5,
    })
  })

  it.each([
    ["the row is gone", undefined],
    ["IMAP was switched off", { ...row, imapEnabled: false }],
    ["there is no IMAP host", { ...row, imapHost: null }],
  ])("does nothing when %s", async (_label, found) => {
    m.findForPoll.mockResolvedValue(found)

    await pollSmtpInbox(data)

    expect(m.fetchNewMessages).not.toHaveBeenCalled()
    expect(m.recordPollFailure).not.toHaveBeenCalled()
  })

  it("skips quietly when another poll of the same inbox holds the lock", async () => {
    const lockError = new Error("lock held")
    m.runExclusive.mockRejectedValue(lockError)
    m.isLockAcquisitionError.mockReturnValue(true)

    await expect(pollSmtpInbox(data)).resolves.toBeUndefined()

    expect(m.isLockAcquisitionError).toHaveBeenCalledWith(
      lockError,
      "smtp:imap:smtp-1",
    )
    expect(m.fetchNewMessages).not.toHaveBeenCalled()
  })

  it("rethrows an unexpected lock error", async () => {
    m.runExclusive.mockRejectedValue(new Error("redis exploded"))

    await expect(pollSmtpInbox(data)).rejects.toThrow("redis exploded")
  })

  it("locks per inbox with a short acquire wait", async () => {
    m.fetchNewMessages.mockResolvedValue({
      messages: [],
      cursor: { uidValidity: 100, lastUid: 10 },
      hasMore: false,
    })

    await pollSmtpInbox(data)

    expect(m.runExclusive).toHaveBeenCalledWith(
      expect.objectContaining({
        key: "smtp:imap:smtp-1",
        retryTimeoutInSeconds: 1,
      }),
    )
  })
})

describe("pollSmtpInboxes", () => {
  it("enqueues one deduplicated poll job per due inbox and survives one enqueue failing", async () => {
    m.listDueImapInboxes.mockResolvedValue([
      { id: "smtp-1", workspaceId: "ws-1", inboxId: "inbox-1" },
      { id: "smtp-2", workspaceId: "ws-2", inboxId: "inbox-2" },
    ])
    m.queueAdd.mockRejectedValueOnce(new Error("boom"))

    await pollSmtpInboxes()

    expect(m.queueAdd).toHaveBeenCalledTimes(2)
    expect(m.queueAdd).toHaveBeenLastCalledWith(
      "pollSmtpInbox",
      {
        type: "pollSmtpInbox",
        data: { integrationId: "smtp-2", workspaceId: "ws-2" },
      },
      {
        jobId: "smtp-imap-poll-smtp-2",
        attempts: 1,
        removeOnComplete: true,
        // A retained failed job would reserve the id and block every later poll.
        removeOnFail: true,
      },
    )
  })

  it("does nothing when no inbox is due", async () => {
    m.listDueImapInboxes.mockResolvedValue([])

    await pollSmtpInboxes()

    expect(m.queueAdd).not.toHaveBeenCalled()
  })
})
