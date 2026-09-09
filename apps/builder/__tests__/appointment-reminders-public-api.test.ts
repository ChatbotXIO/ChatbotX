import { beforeEach, describe, expect, test, vi } from "vitest"

type RouteConfig = {
  method: string
  path: string
  summary: string
  tags: string[]
  successStatus?: number
}

type CapturedProcedure = {
  route: RouteConfig
  handler?: (...args: any[]) => any
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
      handler: vi.fn((fn: (...args: any[]) => any) => {
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

const appointmentReminderService = {
  listDispatches: vi.fn(),
}
vi.mock("@chatbotx.io/business", () => ({ appointmentReminderService }))

vi.mock("@chatbotx.io/database/schema", () => {
  const schema = {
    pick: vi.fn(() => schema),
    extend: vi.fn(() => schema),
    omit: vi.fn(() => schema),
    and: vi.fn(() => schema),
    optional: vi.fn(() => schema),
  }
  return {
    createSelectSchema: vi.fn(() => schema),
    appointmentReminderDispatchModel: {},
  }
})

await import("@/features/appointment-management/api/public")

const findProcedure = (method: string, path: string) => {
  const found = capturedProcedures.find(
    (p) => p.route.method === method && p.route.path === path,
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

test("registers the appointment reminders public router under the appointments scope", () => {
  expect(scopeArgAtImport).toBe("appointments")
})

describe("GET /v1/appointment-reminders", () => {
  const procedure = findProcedure("GET", "/v1/appointment-reminders")

  test("always passes workspaceId explicitly, since the repository's list input treats it as optional", async () => {
    appointmentReminderService.listDispatches.mockResolvedValueOnce({
      data: [],
      pageCount: 1,
    })

    await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { page: 1, perPage: 50, status: "pending" },
    })

    expect(appointmentReminderService.listDispatches).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      status: "pending",
      page: 1,
      perPage: 50,
    })
  })

  test("never omits workspaceId even when the caller's input has none", async () => {
    appointmentReminderService.listDispatches.mockResolvedValueOnce({
      data: [],
      pageCount: 1,
    })

    await procedure.handler?.({
      context: { workspace: { id: "workspace-2" } },
      input: { page: 1, perPage: 50 },
    })

    const call = appointmentReminderService.listDispatches.mock.calls[0]?.[0]
    expect(call.workspaceId).toBe("workspace-2")
  })
})
