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

const channelTokenRefreshService = { refreshWorkspace: vi.fn() }
const workspaceLifecycleService = { freezeWorkspaceRuntime: vi.fn() }
const workspaceService = {
  findById: vi.fn(),
  update: vi.fn(),
  scheduleDeletion: vi.fn(),
  cancelDeletion: vi.fn(),
}
const workspaceSupportAccessService = { enable: vi.fn(), disable: vi.fn() }

vi.mock("@chatbotx.io/business", () => ({
  channelTokenRefreshService,
  workspaceLifecycleService,
  workspaceService,
  workspaceSupportAccessService,
}))

vi.mock("@chatbotx.io/integration-instagram", () => ({ integration: {} }))
vi.mock("@chatbotx.io/integration-instagram-facebook", () => ({
  integration: {},
}))
vi.mock("@chatbotx.io/integration-messenger", () => ({ integration: {} }))
vi.mock("@chatbotx.io/integration-whatsapp", () => ({ integration: {} }))

vi.mock("@/features/workspaces/schema/public", () => ({
  refreshChannelTokensPublicResponse: z.object({}),
  updateWorkspacePublicRequest: z.object({}),
  updateWorkspaceStatusPublicRequest: z.object({}),
  updateWorkspaceSupportAccessPublicRequest: z.object({}),
  workspacePublicResource: z.object({}),
}))

vi.mock("@/lib/orpc/orpc-error-helper", () => ({
  possibleErrorsOnCreatingResource: {},
  possibleErrorsOnDeletingResource: {},
  possibleErrorsOnFindingResource: {},
  possibleErrorsOnMutatingResource: {},
}))

await import("@/features/workspaces/api/public")
const { channelTokenRefreshCallbacks } = await import(
  "@/features/workspaces/lib/channel-refresh-callbacks"
)

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

beforeEach(() => {
  vi.clearAllMocks()
})

test("registers the workspace public router under the workspace scope", () => {
  expect(scopeArgAtImport).toBe("workspace")
})

describe("GET /v1/workspace", () => {
  const procedure = findProcedure("GET", "/v1/workspace")

  test("gets the authenticated workspace", async () => {
    const workspace = { id: "workspace-1", name: "Workspace" }
    workspaceService.findById.mockResolvedValueOnce(workspace)

    await expect(procedure.handler?.({ context, input: {} })).resolves.toEqual(
      workspace,
    )

    expect(workspaceService.findById).toHaveBeenCalledWith({
      id: "workspace-1",
    })
  })
})

describe("PATCH /v1/workspace", () => {
  const procedure = findProcedure("PATCH", "/v1/workspace")

  test("updates the authenticated workspace with the submitted settings", async () => {
    const input = { name: "Renamed" }
    const workspace = { id: "workspace-1", name: "Renamed" }
    workspaceService.update.mockResolvedValueOnce(workspace)

    await expect(procedure.handler?.({ context, input })).resolves.toEqual(
      workspace,
    )

    expect(workspaceService.update).toHaveBeenCalledWith({
      id: "workspace-1",
      data: input,
    })
  })
})

describe("PUT /v1/workspace/status", () => {
  const procedure = findProcedure("PUT", "/v1/workspace/status")

  test("updates the authenticated workspace status and hours", async () => {
    const input = {
      isActive: false,
      startTime: "09:00",
      endTime: "17:00",
    }
    const workspace = { id: "workspace-1", ...input }
    workspaceService.update.mockResolvedValueOnce(workspace)

    await expect(procedure.handler?.({ context, input })).resolves.toEqual(
      workspace,
    )

    expect(workspaceService.update).toHaveBeenCalledWith({
      id: "workspace-1",
      data: input,
    })
  })
})

describe("POST /v1/workspace/deletion", () => {
  const procedure = findProcedure("POST", "/v1/workspace/deletion")

  test("schedules deletion and freezes the authenticated workspace runtime", async () => {
    const workspace = { id: "workspace-1", scheduledDeletionAt: new Date() }
    workspaceService.scheduleDeletion.mockResolvedValueOnce(workspace)
    workspaceLifecycleService.freezeWorkspaceRuntime.mockResolvedValueOnce(
      undefined,
    )

    await expect(procedure.handler?.({ context, input: {} })).resolves.toEqual(
      workspace,
    )

    expect(workspaceService.scheduleDeletion).toHaveBeenCalledWith({
      id: "workspace-1",
    })
    expect(
      workspaceLifecycleService.freezeWorkspaceRuntime,
    ).toHaveBeenCalledWith("workspace-1")
  })
})

describe("DELETE /v1/workspace/deletion", () => {
  const procedure = findProcedure("DELETE", "/v1/workspace/deletion")

  test("cancels deletion for the authenticated workspace", async () => {
    workspaceService.cancelDeletion.mockResolvedValueOnce(undefined)

    await expect(
      procedure.handler?.({ context, input: {} }),
    ).resolves.toBeUndefined()

    expect(workspaceService.cancelDeletion).toHaveBeenCalledWith({
      id: "workspace-1",
    })
  })
})

describe("PUT /v1/workspace/support-access", () => {
  const procedure = findProcedure("PUT", "/v1/workspace/support-access")

  test("enables support access for the authenticated workspace", async () => {
    workspaceSupportAccessService.enable.mockResolvedValueOnce(undefined)

    await expect(
      procedure.handler?.({ context, input: { enabled: true } }),
    ).resolves.toBeUndefined()

    expect(workspaceSupportAccessService.enable).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      actorUserId: null,
    })
  })

  test("disables support access for the authenticated workspace", async () => {
    workspaceSupportAccessService.disable.mockResolvedValueOnce(undefined)

    await expect(
      procedure.handler?.({ context, input: { enabled: false } }),
    ).resolves.toBeUndefined()

    expect(workspaceSupportAccessService.disable).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      actorUserId: null,
    })
  })
})

describe("POST /v1/workspace/channel-tokens/refresh", () => {
  const procedure = findProcedure(
    "POST",
    "/v1/workspace/channel-tokens/refresh",
  )

  test("refreshes channel tokens for the authenticated workspace", async () => {
    const result = { refreshed: 2, failed: 1 }
    channelTokenRefreshService.refreshWorkspace.mockResolvedValueOnce(result)

    await expect(procedure.handler?.({ context, input: {} })).resolves.toEqual(
      result,
    )

    expect(channelTokenRefreshService.refreshWorkspace).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      ...channelTokenRefreshCallbacks,
    })
  })
})
