// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  findWorkspaceByTokenHash,
  isWorkspaceScheduledForDeletion,
  getAccessState,
  isAtLimit,
  assertApiNotRateLimited,
} = vi.hoisted(() => ({
  findWorkspaceByTokenHash: vi.fn(),
  isWorkspaceScheduledForDeletion: vi.fn().mockReturnValue(false),
  getAccessState: vi.fn().mockResolvedValue({ blocked: false }),
  isAtLimit: vi.fn().mockResolvedValue(false),
  assertApiNotRateLimited: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("@chatbotx.io/business", () => ({
  workspaceApiTokenService: { findWorkspaceByTokenHash },
  isWorkspaceScheduledForDeletion,
  userQuotaService: { getAccessState },
  quotaEnforcementService: { isAtLimit },
}))

const minigameService = {
  list: vi.fn(),
  find: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  updatePartial: vi.fn(),
  delete: vi.fn(),
  deleteMany: vi.fn(),
  setEnabled: vi.fn(),
}
const minigameContactService = { listPlays: vi.fn(), list: vi.fn() }

vi.mock("@chatbotx.io/business/minigame", () => ({
  minigameService,
  minigameContactService,
}))

vi.mock("@/lib/log", () => ({
  logger: { warn: vi.fn(), error: vi.fn() },
}))

vi.mock("@/lib/rate-limit/api-rate-limit", () => ({
  assertApiNotRateLimited,
}))

vi.mock("@/lib/rate-limit/guest-rate-limit", () => ({
  getGuestClientIp: () => "203.0.113.9",
}))

vi.mock("@/env", () => ({ isCloud: () => true }))

// `@/orpc` also exports `authorizedAPI`, which pulls in the full better-auth
// stack via `authMiddleware` — irrelevant here and unsafe to initialize in a
// unit test. Same stub as workspace-token-scope-enforcement.test.ts.
vi.mock("@/middlewares/auth", () => ({
  authMiddleware: vi.fn(),
}))

const { call } = await import("@orpc/server")
const { minigamesPublicRouter } = await import(
  "../src/features/minigames/api/public"
)

const TOKEN = "cbx_ws_fixture"

const authResult = (scopes: string[] | null) => ({
  workspace: { id: "ws-1", ownerId: "owner-1" },
  apiToken: { id: "token-1", permission: "full" as const, scopes },
})

const invoke = (procedure: unknown, input: unknown = {}) =>
  call(procedure as Parameters<typeof call>[0], input, {
    context: { headers: new Headers({ Authorization: `Bearer ${TOKEN}` }) },
  })

beforeEach(() => {
  vi.clearAllMocks()
  isWorkspaceScheduledForDeletion.mockReturnValue(false)
  getAccessState.mockResolvedValue({ blocked: false })
  isAtLimit.mockResolvedValue(false)
  assertApiNotRateLimited.mockResolvedValue(undefined)
})

describe("real router: minigames public API scope wiring", () => {
  test("a contacts-scoped token is denied the real GET /v1/minigames route with FORBIDDEN", async () => {
    findWorkspaceByTokenHash.mockResolvedValue(authResult(["contacts"]))

    await expect(invoke(minigamesPublicRouter.list)).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Token is not authorized for the 'minigames' scope",
    })
  })

  test("null scopes (unrestricted) passes the real GET /v1/minigames route", async () => {
    findWorkspaceByTokenHash.mockResolvedValue(authResult(null))
    minigameService.list.mockResolvedValue({ data: [], pageCount: 1 })

    await expect(invoke(minigamesPublicRouter.list)).resolves.toMatchObject({
      data: [],
      pageCount: 1,
    })
  })

  const minigameInput = {
    type: "jackpot",
    generalSettings: { name: "Prize game" },
    appearance: {},
    playerSettings: {},
    prizeSettings: { prizes: [] },
    winningMessageSettings: {},
    nonWinningMessageSettings: {},
  }

  test.each([
    [
      "POST /v1/minigames",
      () => invoke(minigamesPublicRouter.create, minigameInput),
    ],
    [
      "PUT /v1/minigames/{id}",
      () =>
        invoke(minigamesPublicRouter.update, {
          id: "game-1",
          ...minigameInput,
        }),
    ],
    [
      "PATCH /v1/minigames/{id}",
      () =>
        invoke(minigamesPublicRouter.patch, {
          id: "game-1",
          generalSettings: { name: "Renamed" },
        }),
    ],
    [
      "DELETE /v1/minigames/{id}",
      () => invoke(minigamesPublicRouter.delete, { id: "game-1" }),
    ],
    [
      "POST /v1/minigames/bulk-delete",
      () => invoke(minigamesPublicRouter.deleteMany, { ids: ["game-1"] }),
    ],
  ])("a read_only token is denied %s before any service call", async (_label, run) => {
    findWorkspaceByTokenHash.mockResolvedValue({
      workspace: { id: "ws-1", ownerId: "owner-1" },
      apiToken: {
        id: "token-1",
        permission: "read_only" as const,
        scopes: null,
      },
    })

    await expect(run()).rejects.toMatchObject({ code: "FORBIDDEN" })

    expect(minigameService.create).not.toHaveBeenCalled()
    expect(minigameService.update).not.toHaveBeenCalled()
    expect(minigameService.updatePartial).not.toHaveBeenCalled()
    expect(minigameService.delete).not.toHaveBeenCalled()
    expect(minigameService.deleteMany).not.toHaveBeenCalled()
  })

  // Cross-workspace isolation: `workspaceId` must always come from the
  // authenticated token's `context.workspace.id`, never from client input —
  // even when the client's `{id}` path param names a minigame in a
  // different workspace.
  describe("cross-workspace isolation: workspaceId always comes from the token", () => {
    beforeEach(() => {
      findWorkspaceByTokenHash.mockResolvedValue(
        authResult(null) /* unrestricted scope, full permission */,
      )
    })

    test("patch scopes updatePartial to the token's workspace, not any workspace implied by the id", async () => {
      minigameService.updatePartial.mockResolvedValueOnce({
        id: "999999",
        name: "Renamed",
        type: "jackpot",
        enabled: true,
        generalSettings: {
          name: "Renamed",
          showName: false,
          playedAtFrom: "2026-01-01T00:00:00.000Z",
          playedAtTo: "2026-12-31T00:00:00.000Z",
          rulesDescription: "",
          openerTagIds: [],
          playerTagIds: [],
          newFriendTagIds: [],
        },
        appearance: {
          backgroundColor: "#F5A623",
          machineColor: "#4A90D9",
          decorativeColor: "#FFFFFF",
          ruleTextColor: "#000000",
          backgroundImage: { mode: "file", url: "" },
          prizeDescriptionImage: { mode: "file", url: "" },
          startButtonImage: { mode: "file", url: "" },
        },
        playerSettings: {
          resetPolicy: "never",
          drawsPerPerson: 1,
          maxSharesPerPerson: 0,
          sharingFlowId: null,
          sharingNodeId: null,
        },
        prizeSettings: {
          prizes: [],
          nonWinning: {
            title: "Try again",
            loseRate: 100,
            loseImage: { mode: "file", url: "" },
          },
          prizeNameCustomFieldId: null,
        },
        winningMessageSettings: { enabled: false, mode: "text", text: "" },
        nonWinningMessageSettings: {
          enabled: false,
          mode: "text",
          text: "",
        },
        playsCount: 0,
        participantsCount: 0,
        winnersCount: 0,
        sharesCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      })

      await invoke(minigamesPublicRouter.patch, {
        id: "999999",
        generalSettings: {
          name: "Renamed",
          playedAtFrom: "2026-01-01T00:00:00.000Z",
          playedAtTo: "2026-12-31T00:00:00.000Z",
        },
      })

      expect(minigameService.updatePartial).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: "ws-1",
          id: "999999",
        }),
      )
    })

    test("deleteMany scopes to the token's workspace, not any workspace implied by the ids", async () => {
      minigameService.deleteMany.mockResolvedValueOnce(undefined)

      await invoke(minigamesPublicRouter.deleteMany, { ids: ["999999"] })

      expect(minigameService.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: "ws-1",
          ids: ["999999"],
        }),
      )
    })
  })
})
