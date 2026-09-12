import { beforeEach, describe, expect, test, vi } from "vitest"
import { z } from "zod"

type RouteConfig = {
  method: string
  path: string
  summary: string
  tags: string[]
  successStatus?: number
}

type CapturedHandler = (args: {
  context: { workspace: { id: string } }
  input: unknown
}) => Promise<unknown>

type CapturedProcedure = {
  route: RouteConfig
  handler?: CapturedHandler
}

const { workspaceTokenAuthAPIForScope, capturedProcedures } = vi.hoisted(() => {
  const capturedProcedures: CapturedProcedure[] = []

  const makeProcedure = (route: RouteConfig) => {
    const record: CapturedProcedure = { route }
    capturedProcedures.push(record)

    const chain = {
      input: vi.fn(() => chain),
      output: vi.fn(() => chain),
      errors: vi.fn(() => chain),
      handler: vi.fn((fn: CapturedHandler) => {
        record.handler = fn
        return { handler: fn }
      }),
    }
    return chain
  }

  const workspaceTokenAuthAPI = {
    route: vi.fn((config: RouteConfig) => makeProcedure(config)),
  }

  return {
    workspaceTokenAuthAPIForScope: vi.fn(
      (_scope: string) => workspaceTokenAuthAPI,
    ),
    capturedProcedures,
  }
})

vi.mock("@/orpc", () => ({ workspaceTokenAuthAPIForScope }))

const minigameService = {
  list: vi.fn(),
  find: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  deleteMany: vi.fn(),
  setEnabled: vi.fn(),
}
const minigameContactService = { listPlays: vi.fn() }

vi.mock("@chatbotx.io/business/minigame", () => ({
  minigameService,
  minigameContactService,
}))

vi.mock("@/features/minigames/schema/resource", () => ({
  minigameResource: z.object({}),
}))

vi.mock("@/features/minigames/schema/public", () => ({
  createMinigamePublicRequest: z.object({}),
  listMinigamePlaysPublicRequest: z.object({}),
  listMinigamePlaysPublicResponse: z.object({}),
  listMinigamesPublicRequest: z.object({}),
  listMinigamesPublicResponse: z.object({}),
  minigamePublicResource: z.object({}),
  setMinigameEnabledPublicRequest: z.object({}),
  updateMinigamePublicRequest: z.object({}),
}))

vi.mock("@/lib/orpc/orpc-error-helper", () => ({
  possibleErrorsOnCreatingResource: {},
  possibleErrorsOnDeletingResource: {},
  possibleErrorsOnFindingResource: {},
  possibleErrorsOnListingResource: {},
  possibleErrorsOnMutatingResource: {},
}))

await import("@/features/minigames/api/public")

const findProcedure = (method: string, path: string) => {
  const found = capturedProcedures.find(
    (procedure) =>
      procedure.route.method === method && procedure.route.path === path,
  )
  if (!found) {
    throw new Error(`No procedure registered for ${method} ${path}`)
  }
  return found
}

const scopeArgAtImport = workspaceTokenAuthAPIForScope.mock.calls[0]?.[0]
const context = { workspace: { id: "workspace-1" } }

const minigameInput = {
  type: "jackpot",
  generalSettings: { name: "Prize game" },
  appearance: {},
  playerSettings: {},
  prizeSettings: { prizes: [] },
  winningMessageSettings: {},
  nonWinningMessageSettings: {},
}

beforeEach(() => {
  vi.clearAllMocks()
})

test("registers the minigames public router under the minigames scope", () => {
  expect(scopeArgAtImport).toBe("minigames")
})

describe("GET /v1/minigames", () => {
  const procedure = findProcedure("GET", "/v1/minigames")

  test("lists minigames in the authenticated workspace", async () => {
    const result = { data: [{ id: "game-1" }], pageCount: 2 }
    minigameService.list.mockResolvedValueOnce(result)

    await expect(
      procedure.handler?.({
        context,
        input: { page: 1, perPage: 50, name: "Prize" },
      }),
    ).resolves.toEqual(result)

    expect(minigameService.list).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      page: 1,
      perPage: 50,
      name: "Prize",
    })
  })
})

describe("GET /v1/minigames/{id}", () => {
  const procedure = findProcedure("GET", "/v1/minigames/{id}")

  test("gets a minigame scoped to the authenticated workspace", async () => {
    const minigame = { id: "game-1" }
    minigameService.find.mockResolvedValueOnce(minigame)

    await expect(
      procedure.handler?.({ context, input: { id: "game-1" } }),
    ).resolves.toEqual(minigame)

    expect(minigameService.find).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      id: "game-1",
    })
  })

  test("propagates the service's declared not-found error", async () => {
    minigameService.find.mockRejectedValueOnce(new Error("Minigame not found"))

    await expect(
      procedure.handler?.({ context, input: { id: "missing" } }),
    ).rejects.toThrow("Minigame not found")
  })
})

describe("POST /v1/minigames", () => {
  const procedure = findProcedure("POST", "/v1/minigames")

  test("creates a minigame in the authenticated workspace", async () => {
    const minigame = { id: "game-1" }
    minigameService.create.mockResolvedValueOnce(minigame)

    await expect(
      procedure.handler?.({ context, input: minigameInput }),
    ).resolves.toEqual(minigame)

    expect(minigameService.create).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      ...minigameInput,
    })
  })
})

describe("PUT /v1/minigames/{id}", () => {
  const procedure = findProcedure("PUT", "/v1/minigames/{id}")

  test("updates a minigame and preserves the submitted prize baseline", async () => {
    const minigame = { id: "game-1" }
    const originalPrizeQuantities = { "prize-1": 4 }
    minigameService.update.mockResolvedValueOnce(minigame)

    await expect(
      procedure.handler?.({
        context,
        input: { id: "game-1", ...minigameInput, originalPrizeQuantities },
      }),
    ).resolves.toEqual(minigame)

    expect(minigameService.update).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      id: "game-1",
      ...minigameInput,
      originalPrizeQuantities,
    })
  })
})

describe("DELETE /v1/minigames/{id}", () => {
  const procedure = findProcedure("DELETE", "/v1/minigames/{id}")

  test("deletes the selected minigame in the authenticated workspace", async () => {
    minigameService.deleteMany.mockResolvedValueOnce(undefined)

    await expect(
      procedure.handler?.({ context, input: { id: "game-1" } }),
    ).resolves.toBeUndefined()

    expect(minigameService.deleteMany).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      ids: ["game-1"],
    })
  })
})

describe("PATCH /v1/minigames/{id}/enabled", () => {
  const procedure = findProcedure("PATCH", "/v1/minigames/{id}/enabled")

  test("sets the minigame enabled state in the authenticated workspace", async () => {
    const minigame = { id: "game-1", enabled: false }
    minigameService.setEnabled.mockResolvedValueOnce(minigame)

    await expect(
      procedure.handler?.({
        context,
        input: { id: "game-1", enabled: false },
      }),
    ).resolves.toEqual(minigame)

    expect(minigameService.setEnabled).toHaveBeenCalledWith(
      { workspaceId: "workspace-1", id: "game-1" },
      false,
    )
  })
})

describe("GET /v1/minigames/{id}/plays", () => {
  const procedure = findProcedure("GET", "/v1/minigames/{id}/plays")

  test("lists play records for the requested contact", async () => {
    const plays = [{ id: "play-1", isWinning: true }]
    minigameContactService.listPlays.mockResolvedValueOnce(plays)

    await expect(
      procedure.handler?.({
        context,
        input: { id: "game-1", contactId: "contact-1" },
      }),
    ).resolves.toEqual({ data: plays })

    expect(minigameContactService.listPlays).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      minigameId: "game-1",
      contactId: "contact-1",
    })
  })
})
