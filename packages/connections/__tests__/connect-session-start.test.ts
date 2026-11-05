// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  createSession: vi.fn(),
  compensate: vi.fn(),
  dispatchStagedInstalls: vi.fn(),
  authorizeUrl: vi.fn(() => "https://provider.test/authorize"),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: { transaction: mocks.transaction },
}))
vi.mock("@chatbotx.io/database/repositories", () => ({
  connectionRepository: {},
  integrationInstagramRepository: {},
}))
vi.mock("@chatbotx.io/business/connect-session", () => ({
  connectSessionService: { create: mocks.createSession },
}))
vi.mock("@chatbotx.io/business/connection", () => ({
  authExpiresAtOf: vi.fn(),
  connectionStateService: {},
  isActiveConnectionStatus: () => false,
  resolveForeignKey: vi.fn(),
  resolveOwnerId: vi.fn(),
  saveOrInsertSatellite: vi.fn(),
  withQuotaCompensation: vi.fn(),
}))
vi.mock("@chatbotx.io/business/errors", () => ({
  connectionAlreadyConnectedException: vi.fn(),
  connectionCredentialsRejectedException: vi.fn(),
  connectionIdentityMismatchException: vi.fn(),
  connectionNoCandidatesException: vi.fn(),
  connectionNotConfiguredException: vi.fn(),
  connectionNotOAuthException: vi.fn(),
  connectionProviderUnavailableException: vi.fn(),
  connectionStateMismatchException: vi.fn(),
  connectSessionExpiredException: vi.fn(),
  notFoundException: vi.fn(),
  toPublicErrorMessage: vi.fn(),
}))
vi.mock("@chatbotx.io/business/template-install-dispatch", () => ({
  dispatchStagedInstalls: mocks.dispatchStagedInstalls,
}))
vi.mock("@chatbotx.io/business/workspace", () => ({
  compensateWorkspaceQuotaConsumption: mocks.compensate,
}))
vi.mock("@chatbotx.io/encryption", () => ({ encryptUtils: {} }))
vi.mock("../src/connect-targets", () => ({ failSession: vi.fn() }))
vi.mock("../src/logger", () => ({ logger: {} }))
vi.mock("../src/internal", () => ({
  encryptedAuthorizationSchema: {},
  providerFailureStatus: vi.fn(),
  resolveAdapter: () => ({ provider: { authorizeUrl: mocks.authorizeUrl } }),
  subscribeWebhookBestEffort: vi.fn(),
  toConnectionProviderError: vi.fn(),
}))

const { startSession } = await import("../src/connect-session-flow")

type StartSessionInput = Parameters<typeof startSession>[0]

const baseInput = {
  provider: "instagram",
  purpose: "connect",
  credential: {},
  callbackUrl: "https://app.test/callback",
  actorUserId: "user-1",
} satisfies Pick<
  StartSessionInput,
  "provider" | "purpose" | "credential" | "callbackUrl" | "actorUserId"
>

/** Like `workspaceService.create` with a caller transaction: marks the seat consumed once the row is written. */
const createsWorkspace =
  (id: string) =>
  (
    _tx: unknown,
    quotaConsumption: { consumed: boolean },
  ): Promise<{ id: string }> => {
    quotaConsumption.consumed = true
    return Promise.resolve({ id })
  }

/** Like `ensureFirstForOwner`: hands back a workspace that already existed, consuming nothing. */
const reusesWorkspace = (id: string) => () => Promise.resolve({ id })

beforeEach(() => {
  vi.clearAllMocks()
  mocks.transaction.mockImplementation(async (run: (tx: unknown) => unknown) =>
    run({ tx: true }),
  )
  mocks.createSession.mockResolvedValue({
    session: {
      id: "s-1",
      workspaceId: "ws-new",
      nextAction: { type: "open_url", url: "https://provider.test/authorize" },
    },
  })
  mocks.dispatchStagedInstalls.mockResolvedValue(undefined)
})

describe("startSession staged template installs", () => {
  test("dispatches once after the transaction that created the workspace commits", async () => {
    const order: string[] = []
    mocks.transaction.mockImplementation(
      async (run: (tx: unknown) => Promise<unknown>) => {
        const result = await run({ tx: true })
        order.push("commit")
        return result
      },
    )
    mocks.dispatchStagedInstalls.mockImplementation(() => {
      order.push("dispatch")
      return Promise.resolve(undefined)
    })

    await startSession({
      ...baseInput,
      createWorkspace: createsWorkspace("ws-new"),
    })

    expect(order).toEqual(["commit", "dispatch"])
    expect(mocks.dispatchStagedInstalls).toHaveBeenCalledWith("ws-new")
  })

  test("dispatches too when the creation callback handed back an existing workspace", async () => {
    await startSession({
      ...baseInput,
      createWorkspace: reusesWorkspace("ws-existing"),
    })

    expect(mocks.dispatchStagedInstalls).toHaveBeenCalledTimes(1)
  })

  test("does not dispatch for a session on an existing workspace", async () => {
    await startSession({ ...baseInput, workspaceId: "ws-1" })

    expect(mocks.dispatchStagedInstalls).not.toHaveBeenCalled()
  })

  test("does not dispatch, and hands the seat back, when the transaction rolls back", async () => {
    mocks.createSession.mockRejectedValueOnce(new Error("session cap"))

    await expect(
      startSession({
        ...baseInput,
        createWorkspace: createsWorkspace("ws-new"),
      }),
    ).rejects.toThrow("session cap")

    expect(mocks.dispatchStagedInstalls).not.toHaveBeenCalled()
    expect(mocks.compensate).toHaveBeenCalledOnce()
  })
})
