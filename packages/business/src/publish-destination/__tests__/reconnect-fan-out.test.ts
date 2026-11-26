import { beforeEach, describe, expect, test, vi } from "vitest"
import { logger } from "../../logger"
import { reconnectFanOutService } from "../reconnect-fan-out"

const HOP_3_JOB_ID = /-h3$/

const WORKSPACE = "w1"
const CLIENT = "app-1"
const FB_USER = "fb-user-1"

const mocks = vi.hoisted(() => ({
  captureInboxScopes: vi.fn(async () => undefined),
  commitReconnect: vi.fn(),
  decryptObject: vi.fn(),
  encryptObject: vi.fn(async () => ({ iv: "iv", tag: "tag", text: "text" })),
  findCandidates: vi.fn(),
  instagramUpdateAuth: vi.fn(async () => undefined),
  lockUnchangedCandidate: vi.fn(async (_input: { authorizedAt: Date }) => true),
  lowAdd: vi.fn(async () => undefined),
  messengerUpdateAuth: vi.fn(async () => undefined),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  MAX_FAN_OUT_PAGES_PER_QUERY: 500,
  publishFanOutRepository: {
    findCandidates: mocks.findCandidates,
    lockUnchangedCandidate: mocks.lockUnchangedCandidate,
  },
}))
vi.mock("@chatbotx.io/encryption", () => ({
  encryptUtils: {
    decryptObject: mocks.decryptObject,
    encryptObject: mocks.encryptObject,
  },
}))
vi.mock("@chatbotx.io/worker-config", () => ({
  LowJobAction: { reconnectPublishFanOut: "reconnectPublishFanOut" },
  lowQueue: { add: mocks.lowAdd },
}))
vi.mock("../../connection/state-service", () => ({
  connectionStateService: { commitReconnect: mocks.commitReconnect },
}))
vi.mock("../../integration-messenger/service", () => ({
  messengerIntegrationService: { updateAuth: mocks.messengerUpdateAuth },
}))
vi.mock("../../integration-instagram/service", () => ({
  instagramIntegrationService: { updateAuth: mocks.instagramUpdateAuth },
}))
vi.mock("../service", () => ({
  publishDestinationService: { captureInboxScopes: mocks.captureInboxScopes },
}))
vi.mock("../../logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}))

const auth = (accessToken = "old") => ({
  authType: "oauth2",
  clientId: CLIENT,
  clientSecret: "secret",
  metadata: { pageId: "p", version: "v21.0" },
  tokens: { accessToken },
  version: "v21.0",
})

const candidate = (id: string, kind: "messenger" | "instagramFacebook") => ({
  auth: auth(),
  id,
  inboxId: `inbox-${id}`,
  kind,
  name: id,
  pageId: `page-${id}`,
})

const ops = () => ({
  exchangeLongLived: vi.fn(
    async ({ accessToken }: { accessToken: string }) => `long-${accessToken}`,
  ),
  subscribeWebhook: vi.fn(async () => undefined),
})

const input = (pageIds: string[], overrides = {}) => ({
  authorizedAt: new Date("2026-01-01T09:00:00.000Z"),
  clientId: CLIENT,
  facebookUserId: FB_USER,
  grantedScopes: ["pages_manage_posts"],
  kinds: ["messenger", "instagramFacebook"] as (
    | "messenger"
    | "instagramFacebook"
  )[],
  pages: pageIds.map((id) => ({ accessToken: `tok-${id}`, id: `page-${id}` })),
  selectedIntegrationId: "selected",
  workspaceId: WORKSPACE,
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.lockUnchangedCandidate.mockResolvedValue(true)
  mocks.commitReconnect.mockImplementation(
    async (args: { writeAuth: (tx: unknown) => Promise<void> }) => {
      await args.writeAuth({})
    },
  )
})

describe("reconnectFanOutService.fanOut", () => {
  test("asks the repository for the same workspace, app, authorizer and excludes the selected row", async () => {
    mocks.findCandidates.mockResolvedValue([])

    await reconnectFanOutService.fanOut(input(["a", "b"]), ops())

    expect(mocks.findCandidates).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: CLIENT,
        excludeIntegrationId: "selected",
        facebookUserId: FB_USER,
        pageIds: ["page-a", "page-b"],
        workspaceId: WORKSPACE,
      }),
    )
  })

  test("refreshes each row in its own commit and resets its publish scopes", async () => {
    mocks.findCandidates.mockResolvedValue([
      candidate("a", "messenger"),
      candidate("b", "instagramFacebook"),
    ])
    const o = ops()

    const result = await reconnectFanOutService.fanOut(input(["a", "b"]), o)

    expect(result).toMatchObject({ failed: 0, refreshed: 2, remaining: [] })
    expect(mocks.commitReconnect).toHaveBeenCalledTimes(2)
    expect(mocks.messengerUpdateAuth).toHaveBeenCalledWith(
      expect.objectContaining({
        auth: expect.objectContaining({
          tokens: { accessToken: "long-tok-a" },
        }),
        id: "a",
        workspaceId: WORKSPACE,
      }),
    )
    expect(mocks.instagramUpdateAuth).toHaveBeenCalledTimes(1)
    expect(mocks.captureInboxScopes).toHaveBeenCalledWith(
      expect.objectContaining({
        inboxId: "inbox-b",
        publisherKey: "instagramFacebook",
      }),
      expect.anything(),
    )
    expect(o.subscribeWebhook).toHaveBeenCalledTimes(2)
  })

  test("a row disconnected during the token exchange is skipped, never written or revived", async () => {
    mocks.findCandidates.mockResolvedValue([candidate("a", "messenger")])
    mocks.lockUnchangedCandidate.mockResolvedValue(false)
    const o = ops()

    const result = await reconnectFanOutService.fanOut(input(["a"]), o)

    expect(result).toMatchObject({ failed: 0, refreshed: 0, remaining: [] })
    expect(mocks.lockUnchangedCandidate).toHaveBeenCalledTimes(1)
    expect(mocks.messengerUpdateAuth).not.toHaveBeenCalled()
    expect(mocks.captureInboxScopes).not.toHaveBeenCalled()
    expect(o.subscribeWebhook).not.toHaveBeenCalled()
  })

  test("a row reconnected by someone else during the exchange keeps its newer credentials", async () => {
    mocks.findCandidates.mockResolvedValue([candidate("a", "messenger")])
    mocks.lockUnchangedCandidate.mockResolvedValue(false)

    const result = await reconnectFanOutService.fanOut(input(["a"]), ops())

    expect(mocks.lockUnchangedCandidate).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: CLIENT,
        facebookUserId: FB_USER,
        workspaceId: WORKSPACE,
      }),
      expect.anything(),
    )
    expect(result.refreshed).toBe(0)
    expect(mocks.messengerUpdateAuth).not.toHaveBeenCalled()
  })

  test("one row failing never fails the others", async () => {
    mocks.findCandidates.mockResolvedValue([
      candidate("a", "messenger"),
      candidate("b", "messenger"),
      candidate("c", "messenger"),
    ])
    mocks.messengerUpdateAuth.mockRejectedValueOnce(new Error("db down"))

    const result = await reconnectFanOutService.fanOut(
      input(["a", "b", "c"]),
      ops(),
    )

    expect(result).toMatchObject({ failed: 1, refreshed: 2 })
  })

  test("a failed token exchange never writes the page token or the app secret to the log", async () => {
    mocks.findCandidates.mockResolvedValue([candidate("a", "messenger")])
    const o = ops()
    o.exchangeLongLived.mockRejectedValue(
      new Error(
        "fetch failed: https://graph.facebook.com/oauth/access_token?fb_exchange_token=tok-a&client_secret=secret",
      ),
    )

    await reconnectFanOutService.fanOut(input(["a"]), o)

    const logged = JSON.stringify(vi.mocked(logger.warn).mock.calls)
    expect(logged).not.toContain("tok-a")
    expect(logged).not.toContain("client_secret=secret")
  })

  test("a failing webhook subscribe never logs the long-lived token or the app secret", async () => {
    mocks.findCandidates.mockResolvedValue([candidate("a", "messenger")])
    const o = ops()
    o.exchangeLongLived.mockResolvedValue("LL-9f3x")
    o.subscribeWebhook.mockRejectedValue(
      new Error("graph rejected LL-9f3x for app secret"),
    )

    await reconnectFanOutService.fanOut(input(["a"]), o)

    const logged = JSON.stringify(vi.mocked(logger.warn).mock.calls)
    expect(logged).not.toContain("LL-9f3x")
    expect(logged).not.toContain("app secret")
  })

  test("a failing webhook subscribe does not fail the row", async () => {
    mocks.findCandidates.mockResolvedValue([candidate("a", "messenger")])
    const o = ops()
    o.subscribeWebhook.mockRejectedValue(new Error("graph"))

    const result = await reconnectFanOutService.fanOut(input(["a"]), o)

    expect(result).toMatchObject({ failed: 0, refreshed: 1 })
  })

  test("a row whose stored auth is unusable is counted failed without a commit", async () => {
    mocks.findCandidates.mockResolvedValue([
      { ...candidate("a", "messenger"), auth: { nope: true } },
    ])

    const result = await reconnectFanOutService.fanOut(input(["a"]), ops())

    expect(result).toMatchObject({ failed: 1, refreshed: 0 })
    expect(mocks.commitReconnect).not.toHaveBeenCalled()
  })

  test("beyond the inline cap the rest is enqueued as a durable low job with no plaintext token", async () => {
    const rows = Array.from({ length: 101 }, (_, index) =>
      candidate(String(index), "messenger"),
    )
    mocks.findCandidates.mockResolvedValue(rows)
    const ids = rows.map((row) => row.id)

    const result = await reconnectFanOutService.fanOut(input(ids), ops())

    expect(result.refreshed).toBe(100)
    expect(result.remaining).toEqual([
      { accessToken: "tok-100", id: "page-100" },
    ])
    expect(result.enqueued).toBe(true)
    expect(mocks.lowAdd).toHaveBeenCalledTimes(1)
    const [name, payload, options] = mocks.lowAdd.mock.calls[0] as unknown as [
      string,
      { data: Record<string, unknown> },
      { jobId: string },
    ]
    expect(name).toBe("reconnectPublishFanOut")
    expect(options.jobId).not.toContain(":")
    expect(JSON.stringify(payload)).not.toContain("tok-100")
    expect(payload.data).toMatchObject({
      clientId: CLIENT,
      facebookUserId: FB_USER,
      workspaceId: WORKSPACE,
    })
  })

  test("the job body decrypts the pages and refreshes without enqueueing again", async () => {
    mocks.decryptObject.mockResolvedValue([
      { accessToken: "tok-a", id: "page-a" },
    ])
    mocks.findCandidates.mockResolvedValue([candidate("a", "messenger")])

    const result = await reconnectFanOutService.runJob(
      {
        authorizedAt: "2026-01-01T09:00:00.000Z",
        clientId: CLIENT,
        encryptedPages: JSON.stringify({ iv: "iv", tag: "tag", text: "t" }),
        facebookUserId: FB_USER,
        grantedScopes: null,
        kinds: ["messenger"],
        hop: 0,
        workspaceId: WORKSPACE,
      },
      ops(),
    )

    expect(result.refreshed).toBe(1)
    expect(mocks.lowAdd).not.toHaveBeenCalled()
    expect(mocks.findCandidates).toHaveBeenCalledWith(
      expect.objectContaining({
        excludeIntegrationId: undefined,
        facebookUserId: FB_USER,
        workspaceId: WORKSPACE,
      }),
    )
  })
})

const jobData = (overrides = {}) => ({
  authorizedAt: "2026-01-01T09:00:00.000Z",
  clientId: CLIENT,
  encryptedPages: JSON.stringify({ iv: "iv", tag: "tag", text: "t" }),
  facebookUserId: FB_USER,
  grantedScopes: null,
  hop: 0,
  kinds: ["messenger" as const],
  selectedIntegrationId: "selected",
  workspaceId: WORKSPACE,
  ...overrides,
})

describe("inline input bound (B)", () => {
  test("only the first 100 pages are queried; every later page is enqueued at once", async () => {
    mocks.findCandidates.mockResolvedValue([])
    const ids = Array.from({ length: 250 }, (_, index) => String(index))

    const result = await reconnectFanOutService.fanOut(input(ids), ops())

    expect(mocks.findCandidates).toHaveBeenCalledTimes(1)
    const queried = (
      mocks.findCandidates.mock.calls[0] as unknown as [{ pageIds: string[] }]
    )[0].pageIds
    expect(queried).toHaveLength(100)
    expect(queried).not.toContain("page-100")
    expect(result.remaining).toHaveLength(150)
    expect(result.enqueued).toBe(true)
    expect(mocks.encryptObject).toHaveBeenCalledTimes(1)
    const sealed = (
      mocks.encryptObject.mock.calls[0] as unknown as [{ id: string }[]]
    )[0]
    expect(sealed.map((page) => page.id)).toContain("page-249")
  })
})

describe("selected row (C)", () => {
  test("the queued remainder carries selectedIntegrationId and the worker excludes it", async () => {
    mocks.findCandidates.mockResolvedValue([])
    const ids = Array.from({ length: 101 }, (_, index) => String(index))
    await reconnectFanOutService.fanOut(input(ids), ops())

    const payload = (
      mocks.lowAdd.mock.calls[0] as unknown as [
        string,
        { data: { selectedIntegrationId?: string } },
      ]
    )[1]
    expect(payload.data.selectedIntegrationId).toBe("selected")

    mocks.decryptObject.mockResolvedValue([
      { accessToken: "tok-a", id: "page-a" },
    ])
    await reconnectFanOutService.runJob(
      jobData({ selectedIntegrationId: payload.data.selectedIntegrationId }),
      ops(),
    )
    expect(mocks.findCandidates).toHaveBeenLastCalledWith(
      expect.objectContaining({ excludeIntegrationId: "selected" }),
    )
  })
})

describe("job continuation (A)", () => {
  const overBudget = () => {
    // 101 candidates against an unlimited row cap cannot exhaust time, so make
    // the clock jump past the 5 minute budget after the first row.
    let now = 0
    vi.spyOn(Date, "now").mockImplementation(() => {
      now += 400_000
      return now
    })
  }

  test("pages left when the budget ends continue in a next-hop job, never dropped", async () => {
    mocks.decryptObject.mockResolvedValue(
      ["a", "b"].map((id) => ({ accessToken: `tok-${id}`, id: `page-${id}` })),
    )
    mocks.findCandidates.mockResolvedValue([
      candidate("a", "messenger"),
      candidate("b", "messenger"),
    ])
    overBudget()

    const result = await reconnectFanOutService.runJob(
      jobData({ hop: 2 }),
      ops(),
    )
    vi.restoreAllMocks()

    expect(result.enqueued).toBe(true)
    expect(mocks.lowAdd).toHaveBeenCalledTimes(1)
    const [, payload, options] = mocks.lowAdd.mock.calls[0] as unknown as [
      string,
      { data: { hop: number; selectedIntegrationId?: string } },
      { jobId: string },
    ]
    expect(payload.data.hop).toBe(3)
    expect(payload.data.selectedIntegrationId).toBe("selected")
    expect(options.jobId).toMatch(HOP_3_JOB_ID)
    expect(options.jobId).not.toContain(":")
  })

  test("at the hop limit it stops with a warning instead of looping", async () => {
    mocks.decryptObject.mockResolvedValue([
      { accessToken: "tok-a", id: "page-a" },
    ])
    mocks.findCandidates.mockResolvedValue([candidate("a", "messenger")])
    overBudget()

    const result = await reconnectFanOutService.runJob(
      jobData({ hop: 9 }),
      ops(),
    )
    vi.restoreAllMocks()

    expect(result.enqueued).toBe(false)
    expect(mocks.lowAdd).not.toHaveBeenCalled()
  })
})

describe("authorization fence (a newer reconnect wins)", () => {
  const originAt = new Date("2026-01-01T10:00:00.000Z")

  test("the row check is made against the reconnect's authorization time", async () => {
    mocks.findCandidates.mockResolvedValue([candidate("a", "messenger")])

    await reconnectFanOutService.fanOut(
      { ...input(["a"]), authorizedAt: originAt },
      ops(),
    )

    expect(mocks.lockUnchangedCandidate).toHaveBeenCalledWith(
      expect.objectContaining({ authorizedAt: originAt }),
      expect.anything(),
    )
  })

  test("a row reconnected before the queued job starts is not overwritten", async () => {
    mocks.decryptObject.mockResolvedValue([
      { accessToken: "tok-a", id: "page-a" },
    ])
    mocks.findCandidates.mockResolvedValue([candidate("a", "messenger")])
    // The row now holds a newer authorization: written after the origin.
    mocks.lockUnchangedCandidate.mockImplementation(
      async (args: { authorizedAt: Date }) =>
        args.authorizedAt.getTime() >= Date.parse("2026-01-01T10:05:00.000Z"),
    )

    const result = await reconnectFanOutService.runJob(
      jobData({ authorizedAt: originAt.toISOString() }),
      ops(),
    )

    expect(mocks.lockUnchangedCandidate).toHaveBeenCalledWith(
      expect.objectContaining({ authorizedAt: originAt }),
      expect.anything(),
    )
    expect(result.refreshed).toBe(0)
    expect(mocks.messengerUpdateAuth).not.toHaveBeenCalled()
    expect(mocks.captureInboxScopes).not.toHaveBeenCalled()
  })

  test("the origin travels in the queued remainder", async () => {
    mocks.findCandidates.mockResolvedValue([])
    const ids = Array.from({ length: 150 }, (_, index) => String(index))

    await reconnectFanOutService.fanOut(
      { ...input(ids), authorizedAt: originAt },
      ops(),
    )

    const [, payload] = mocks.lowAdd.mock.calls[0] as unknown as [
      string,
      { data: { authorizedAt: string } },
    ]
    expect(payload.data.authorizedAt).toBe(originAt.toISOString())
  })
})

describe("overlapping reconnects order by their start", () => {
  const first = new Date("2026-01-01T10:00:00.000Z")
  const second = new Date("2026-01-01T10:01:00.000Z")

  /** A one-row stand-in for the fence and the stamp the real write applies. */
  const rowWithState = (updatedAt: Date) => {
    const row = { token: "", updatedAt }
    mocks.findCandidates.mockResolvedValue([candidate("a", "messenger")])
    mocks.lockUnchangedCandidate.mockImplementation(
      async (args: { authorizedAt: Date }) =>
        row.updatedAt.getTime() <= args.authorizedAt.getTime(),
    )
    mocks.messengerUpdateAuth.mockImplementation(((args: {
      auth: { tokens: { accessToken: string } }
      updatedAt: Date
    }) => {
      row.token = args.auth.tokens.accessToken
      row.updatedAt = args.updatedAt
      return Promise.resolve()
    }) as never)
    return row
  }

  const run = async (authorizedAt: Date, token: string) =>
    await reconnectFanOutService.fanOut(
      {
        ...input(["a"]),
        authorizedAt,
        pages: [{ accessToken: token, id: "page-a" }],
      },
      ops(),
    )

  test("the row is stamped with the authorization time, not the write time", async () => {
    rowWithState(new Date("2026-01-01T00:00:00.000Z"))

    await run(first, "A")

    expect(mocks.messengerUpdateAuth).toHaveBeenCalledWith(
      expect.objectContaining({ updatedAt: first }),
    )
  })

  test("the older reconnect's delayed job runs after the newer one: the newer token stays", async () => {
    const row = rowWithState(new Date("2026-01-01T00:00:00.000Z"))

    await run(second, "B")
    const late = await run(first, "A")

    expect(row.token).toBe("long-B")
    expect(late.refreshed).toBe(0)
  })

  test("the older reconnect writes first, then the newer one still replaces it", async () => {
    const row = rowWithState(new Date("2026-01-01T00:00:00.000Z"))

    await run(first, "A")
    const newer = await run(second, "B")

    expect(row.token).toBe("long-B")
    expect(newer.refreshed).toBe(1)
  })

  test("an older write between the newer job's read and its lock does not block the newer one", async () => {
    const row = rowWithState(new Date("2026-01-01T00:00:00.000Z"))
    // The newer job read the row before the older one wrote it.
    mocks.findCandidates.mockImplementation(async () => {
      const read = [candidate("a", "messenger")]
      row.token = "long-A"
      row.updatedAt = first
      return await Promise.resolve(read)
    })

    const newer = await run(second, "B")

    expect(newer.refreshed).toBe(1)
    expect(row.token).toBe("long-B")
    expect(mocks.lockUnchangedCandidate).not.toHaveBeenCalledWith(
      expect.objectContaining({ expectedAccessToken: expect.anything() }),
      expect.anything(),
    )
  })
})
