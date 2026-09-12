import { beforeEach, describe, expect, test, vi } from "vitest"

type RouteConfig = {
  method: string
  path: string
  summary: string
  tags: string[]
  successStatus?: number
}

type ProcedureHandler = (...args: unknown[]) => unknown

type CapturedProcedure = {
  route: RouteConfig
  handler?: ProcedureHandler
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
      handler: vi.fn((fn: ProcedureHandler) => {
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

const userPersistentMenuService = {
  listByWorkspace: vi.fn(),
  findOrFail: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
}
vi.mock("@chatbotx.io/business", () => ({ userPersistentMenuService }))

vi.mock("@chatbotx.io/database/partials", async () => {
  const { z } = await import("zod")
  return {
    messengerPersistentMenuSchema: z.object({}),
  }
})

vi.mock("@chatbotx.io/database/schema", () => {
  const schema = {
    pick: vi.fn(() => schema),
    extend: vi.fn(() => schema),
    omit: vi.fn(() => schema),
  }
  return {
    createSelectSchema: vi.fn(() => schema),
    userPersistentMenuModel: {},
  }
})

await import("@/features/user-persistent-menus/api/public")

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

beforeEach(() => {
  vi.clearAllMocks()
})

test("registers the user persistent menus public router under the channels scope", () => {
  expect(scopeArgAtImport).toBe("channels")
})

describe("GET /v1/user-persistent-menus", () => {
  const procedure = findProcedure("GET", "/v1/user-persistent-menus")

  test("lists the token workspace's user persistent menus with pagination", async () => {
    const menus = [{ id: "menu-1", name: "Main menu" }]
    userPersistentMenuService.listByWorkspace.mockResolvedValueOnce(menus)

    await expect(
      procedure.handler?.({
        context: { workspace: { id: "workspace-1" } },
        input: { page: 1, perPage: 50 },
      }),
    ).resolves.toEqual({ data: menus, pageCount: 1 })

    expect(userPersistentMenuService.listByWorkspace).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
    })
  })
})

describe("GET /v1/user-persistent-menus/{id}", () => {
  const procedure = findProcedure("GET", "/v1/user-persistent-menus/{id}")

  test("delegates to userPersistentMenuService.findOrFail", async () => {
    const menu = { id: "menu-1", name: "Main menu" }
    userPersistentMenuService.findOrFail.mockResolvedValueOnce(menu)

    await expect(
      procedure.handler?.({
        context: { workspace: { id: "workspace-1" } },
        input: { id: "menu-1" },
      }),
    ).resolves.toEqual(menu)

    expect(userPersistentMenuService.findOrFail).toHaveBeenCalledWith({
      id: "menu-1",
      workspaceId: "workspace-1",
    })
  })

  test("propagates the service's not-found rejection", async () => {
    userPersistentMenuService.findOrFail.mockRejectedValueOnce(
      new Error("User persistent menu not found"),
    )

    await expect(
      procedure.handler?.({
        context: { workspace: { id: "workspace-1" } },
        input: { id: "missing" },
      }),
    ).rejects.toThrow("User persistent menu not found")
  })
})

describe("POST /v1/user-persistent-menus", () => {
  const procedure = findProcedure("POST", "/v1/user-persistent-menus")

  test("creates a menu in the token workspace and returns it", async () => {
    const persistentMenus: unknown[] = []
    const created = { id: "menu-1", name: "Main menu", menus: persistentMenus }
    userPersistentMenuService.create.mockResolvedValueOnce(created)

    await expect(
      procedure.handler?.({
        context: { workspace: { id: "workspace-1" } },
        input: { name: "Main menu", persistentMenus },
      }),
    ).resolves.toEqual(created)

    expect(userPersistentMenuService.create).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      name: "Main menu",
      menus: persistentMenus,
    })
  })
})

describe("PUT /v1/user-persistent-menus/{id}", () => {
  const procedure = findProcedure("PUT", "/v1/user-persistent-menus/{id}")

  test("updates a menu in the token workspace and returns it", async () => {
    const persistentMenus: unknown[] = []
    const updated = {
      id: "menu-1",
      name: "Updated menu",
      menus: persistentMenus,
    }
    userPersistentMenuService.update.mockResolvedValueOnce(updated)

    await expect(
      procedure.handler?.({
        context: { workspace: { id: "workspace-1" } },
        input: { id: "menu-1", name: "Updated menu", persistentMenus },
      }),
    ).resolves.toEqual(updated)

    expect(userPersistentMenuService.update).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      id: "menu-1",
      name: "Updated menu",
      menus: persistentMenus,
    })
  })

  test("propagates the service's not-found rejection", async () => {
    userPersistentMenuService.update.mockRejectedValueOnce(
      new Error("User persistent menu not found"),
    )

    await expect(
      procedure.handler?.({
        context: { workspace: { id: "workspace-1" } },
        input: { id: "missing", name: "Updated menu", persistentMenus: [] },
      }),
    ).rejects.toThrow("User persistent menu not found")
  })
})

describe("DELETE /v1/user-persistent-menus/{id}", () => {
  const procedure = findProcedure("DELETE", "/v1/user-persistent-menus/{id}")

  test("deletes the menu from the token workspace", async () => {
    userPersistentMenuService.delete.mockResolvedValueOnce(undefined)

    await expect(
      procedure.handler?.({
        context: { workspace: { id: "workspace-1" } },
        input: { id: "menu-1" },
      }),
    ).resolves.toBeUndefined()

    expect(userPersistentMenuService.delete).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      ids: ["menu-1"],
    })
  })
})
