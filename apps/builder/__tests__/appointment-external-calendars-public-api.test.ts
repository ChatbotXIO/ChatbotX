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

const appointmentExternalCalendarService = {
  list: vi.fn(),
  listWithConnectedCount: vi.fn(),
  disconnect: vi.fn(),
}
vi.mock("@chatbotx.io/business", () => ({ appointmentExternalCalendarService }))

await import("@/features/appointment-external-calendars/api/public")

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

test("registers the appointment external calendars public router under the appointments scope", () => {
  expect(scopeArgAtImport).toBe("appointments")
})

describe("GET /v1/appointment-external-calendars", () => {
  const procedure = findProcedure("GET", "/v1/appointment-external-calendars")

  test("delegates to listWithConnectedCount, never the raw list method that can carry OAuth credentials", async () => {
    appointmentExternalCalendarService.listWithConnectedCount.mockResolvedValueOnce(
      [
        {
          id: "integration-1",
          providerType: "googleCalendar",
          label: "user@example.com (primary)",
          providerCalendarId: "primary",
          email: "user@example.com",
          workspaceId: "workspace-1",
          connectedCount: 2,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    )

    const result = await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { page: 1, perPage: 50 },
    })

    expect(
      appointmentExternalCalendarService.listWithConnectedCount,
    ).toHaveBeenCalledWith({ workspaceId: "workspace-1" })
    expect(appointmentExternalCalendarService.list).not.toHaveBeenCalled()
    expect(result.data).toHaveLength(1)
    expect(result.data[0]).not.toHaveProperty("auth")
  })

  test("paginates in memory", async () => {
    appointmentExternalCalendarService.listWithConnectedCount.mockResolvedValueOnce(
      Array.from({ length: 3 }, (_, index) => ({
        id: `integration-${index}`,
        providerType: "googleCalendar",
        label: `cal-${index}`,
        providerCalendarId: "primary",
        email: null,
        workspaceId: "workspace-1",
        connectedCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
    )

    const result = await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { page: 1, perPage: 2 },
    })

    expect(result.data).toHaveLength(2)
    expect(result.pageCount).toBe(2)
  })
})

describe("DELETE /v1/appointment-external-calendars/{integrationId}", () => {
  const procedure = findProcedure(
    "DELETE",
    "/v1/appointment-external-calendars/{integrationId}",
  )

  test("delegates to appointmentExternalCalendarService.disconnect", async () => {
    appointmentExternalCalendarService.disconnect.mockResolvedValueOnce(
      "integration-1",
    )

    await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { integrationId: "integration-1" },
    })

    expect(appointmentExternalCalendarService.disconnect).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      integrationId: "integration-1",
    })
  })
})
