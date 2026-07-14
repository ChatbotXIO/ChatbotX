import {
  beforeEach,
  describe,
  expect,
  type MockInstance,
  test,
  vi,
} from "vitest"

vi.mock("../src/lib/http-client", () => ({
  facebookGraphClient: {
    get: vi.fn(),
  },
}))

vi.mock("../src/lib/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

// Dynamic imports ensure vi.mock is fully applied before loading these modules.
const { getUserPages } = await import("../src/apis/auth")
const { facebookGraphClient } = await import("../src/lib/http-client")

const mockGet = facebookGraphClient.get as MockInstance

const adminTasks = [
  "ADVERTISE",
  "ANALYZE",
  "CREATE_CONTENT",
  "MANAGE",
  "MODERATE",
]

const directPage = {
  id: "page-direct",
  name: "Direct Page",
  access_token: "direct-token",
  tasks: adminTasks,
}

// Business Manager lookup was disabled in #744 — getUserPages now returns
// direct /me/accounts pages only and always reports bmLookupFailed: false.
describe("getUserPages", () => {
  beforeEach(() => {
    mockGet.mockReset()
  })

  test("returns /me/accounts pages with connectability", async () => {
    mockGet.mockResolvedValueOnce({ data: [directPage] })

    const result = await getUserPages("user-token")

    expect(result).toEqual({
      pages: [{ ...directPage, isConnectable: true }],
      bmLookupFailed: false,
    })
    expect(mockGet).toHaveBeenCalledTimes(1)
    expect(mockGet).toHaveBeenCalledWith("v23.0/me/accounts", expect.anything())
  })

  test("does not call the Business Manager endpoints", async () => {
    mockGet.mockResolvedValueOnce({ data: [directPage] })

    await getUserPages("user-token")

    const endpoints = mockGet.mock.calls.map((call) => call[0])
    expect(endpoints).toEqual(["v23.0/me/accounts"])
  })

  test("paginates /me/accounts until the cursor ends", async () => {
    const directPage2 = {
      id: "page-direct-2",
      name: "Direct Page 2",
      access_token: "direct-token-2",
      tasks: adminTasks,
    }

    mockGet
      .mockResolvedValueOnce({
        data: [directPage],
        paging: {
          cursors: { after: "direct-cursor" },
          next: "https://graph.facebook.com/v23.0/me/accounts?after=direct-cursor",
        },
      })
      .mockResolvedValueOnce({ data: [directPage2] })

    const result = await getUserPages("user-token")

    expect(result.bmLookupFailed).toBe(false)
    expect(result.pages).toEqual([
      { ...directPage, isConnectable: true },
      { ...directPage2, isConnectable: true },
    ])
    expect(mockGet).toHaveBeenCalledTimes(2)
    expect(mockGet).toHaveBeenLastCalledWith("v23.0/me/accounts", {
      searchParams: expect.objectContaining({ after: "direct-cursor" }),
    })
  })

  test("classifies pages and sorts connectable pages first", async () => {
    const missingTaskPage = {
      id: "page-missing-task",
      name: "Missing Task",
      access_token: "missing-task-token",
      tasks: adminTasks.filter((task) => task !== "MODERATE"),
    }
    const emptyTasksPage = {
      id: "page-empty-tasks",
      name: "Empty Tasks",
      access_token: "empty-tasks-token",
      tasks: [],
    }
    const missingTokenPage = {
      id: "page-missing-token",
      name: "Missing Token",
      tasks: adminTasks,
    }

    mockGet.mockResolvedValueOnce({
      data: [missingTaskPage, directPage, emptyTasksPage, missingTokenPage],
    })

    const result = await getUserPages("user-token")

    expect(result.pages).toEqual([
      { ...directPage, isConnectable: true },
      { ...missingTaskPage, isConnectable: false },
      { ...emptyTasksPage, isConnectable: false },
      { ...missingTokenPage, isConnectable: false },
    ])
  })

  test("requests page fields with limit=100 and the user token", async () => {
    mockGet.mockResolvedValueOnce({ data: [directPage] })

    await getUserPages("user-token")

    expect(mockGet).toHaveBeenCalledWith("v23.0/me/accounts", {
      searchParams: expect.objectContaining({
        fields: "id,name,access_token,category,tasks",
        access_token: "user-token",
        limit: "100",
      }),
    })
  })
})
