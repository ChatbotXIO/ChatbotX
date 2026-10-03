// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

type CapturedProcedure = {
  route: { method: string; path: string }
  handler?: (...args: any[]) => any
}

const { orpcMock, capturedProcedures, scopes } = vi.hoisted(() => {
  const capturedProcedures: CapturedProcedure[] = []
  const scopes: string[] = []
  const api = {
    route: (config: CapturedProcedure["route"]) => {
      const record: CapturedProcedure = { route: config }
      capturedProcedures.push(record)
      const chain: Record<string, unknown> = {}
      for (const name of ["input", "output", "errors"]) {
        chain[name] = () => chain
      }
      chain.handler = (fn: (...args: any[]) => any) => {
        record.handler = fn
        return { handler: fn }
      }
      return chain
    },
  }
  return {
    capturedProcedures,
    scopes,
    orpcMock: {
      workspaceTokenAuthAPIForScope: (scope: string) => {
        scopes.push(scope)
        return api
      },
    },
  }
})
vi.mock("@/orpc", () => orpcMock)

const mocks = vi.hoisted(() => ({
  requireInbox: vi.fn(),
  find: vi.fn(),
  findActive: vi.fn(),
  saveSettings: vi.fn(),
  findStatus: vi.fn(),
  setApplyToAll: vi.fn(),
  previewApplyToAll: vi.fn(),
  retry: vi.fn(),
  listHistory: vi.fn(),
}))
vi.mock("@chatbotx.io/business", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  aiHandoverSettingsService: {
    requireInbox: mocks.requireInbox,
    find: mocks.find,
    findActive: mocks.findActive,
  },
  aiHandoverBulkRunService: {
    saveSettings: mocks.saveSettings,
    findStatus: mocks.findStatus,
    setApplyToAll: mocks.setApplyToAll,
    previewApplyToAll: mocks.previewApplyToAll,
    retry: mocks.retry,
    listHistory: mocks.listHistory,
  },
}))
vi.mock("@chatbotx.io/database/client", () => {
  const proxy: unknown = new Proxy(() => proxy, { get: () => proxy })
  return { db: proxy }
})
vi.mock("@chatbotx.io/database/repositories", () => {
  const nested: unknown = new Proxy(
    {},
    { get: (_o, prop) => (prop === "then" ? undefined : nested) },
  )
  return new Proxy(
    {},
    { get: (_o, prop) => (prop === "then" ? undefined : nested) },
  ) as Record<string, unknown>
})

await import("@/features/integration-ai-handover/api/public")
const { setApplyToAllPublicRequest, saveAiHandoverSettingsPublicRequest } =
  await import("@/features/integration-ai-handover/schema/public")

const find = (method: string, path: string) =>
  capturedProcedures.find(
    (p) => p.route.method === method && p.route.path === path,
  )?.handler
const context = { workspace: { id: "ws-1" } }
const BASE = "/v1/inboxes/{inboxId}/ai-handover"
const run = {
  id: "9",
  action: "enable",
  status: "pending",
  message: null,
  requestedAt: new Date("2026-10-01T00:00:00Z"),
  startedAt: null,
  finishedAt: null,
  processedCount: 0,
  skippedCount: 0,
  failedCount: 0,
  totalCount: null,
  currentError: null,
  pausedUntil: null,
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireInbox.mockResolvedValue({ id: "5" })
})

describe("ai-handover public routes", () => {
  test("all routes use the integrations scope", () => {
    expect(new Set(scopes)).toEqual(new Set(["integrations"]))
  })

  test("getSettings validates the Page and returns defaults when never configured", async () => {
    mocks.find.mockResolvedValue(null)

    const result = await find(
      "GET",
      `${BASE}/settings`,
    )?.({
      context,
      input: { inboxId: "5" },
    })

    expect(mocks.requireInbox).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      inboxId: "5",
    })
    expect(result).toEqual({
      enabled: false,
      scheduleEnabled: false,
      timeRanges: [],
      gotoFlowId: null,
      returnMessage: null,
      pauseBotWaitingForStaff: false,
    })
  })

  test("saveSettings goes through the service that also stops a running enable", async () => {
    mocks.saveSettings.mockResolvedValue({
      enabled: false,
      scheduleEnabled: false,
      timeRanges: [],
      gotoFlowId: null,
      returnMessage: null,
      pauseBotWaitingForStaff: false,
    })

    await find(
      "PUT",
      `${BASE}/settings`,
    )?.({
      context,
      input: {
        inboxId: "5",
        enabled: false,
        scheduleEnabled: false,
        timeRanges: [],
        gotoFlowId: null,
        returnMessage: "",
        pauseBotWaitingForStaff: false,
      },
    })

    expect(mocks.saveSettings).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "ws-1", inboxId: "5" }),
    )
  })

  test("setApplyToAll dryRun only counts and never changes anything", async () => {
    mocks.previewApplyToAll.mockResolvedValue({
      isChanged: true,
      eligibleCount: 12,
    })

    const result = await find(
      "POST",
      `${BASE}/apply-to-all`,
    )?.({
      context,
      input: {
        inboxId: "5",
        applyToAllCustomers: true,
        message: "",
        dryRun: true,
      },
    })

    expect(result).toEqual({
      dryRun: true,
      isChanged: true,
      eligibleCount: 12,
      run: null,
    })
    expect(mocks.setApplyToAll).not.toHaveBeenCalled()
  })

  test("setApplyToAll with a confirmation runs without a user and bounded by confirmCount", async () => {
    mocks.setApplyToAll.mockResolvedValue({ isChanged: true, run })

    const result = await find(
      "POST",
      `${BASE}/apply-to-all`,
    )?.({
      context,
      input: {
        inboxId: "5",
        applyToAllCustomers: true,
        message: "",
        confirmCount: 20,
      },
    })

    expect(mocks.setApplyToAll).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-1",
        inboxId: "5",
        userId: null,
        confirmMaxEligible: 20,
      }),
    )
    expect(result).toMatchObject({ dryRun: false, isChanged: true })
    expect(result.run.id).toBe("9")
  })

  test("a real change without confirmCount is rejected by the schema", () => {
    const result = setApplyToAllPublicRequest.safeParse({
      inboxId: "5",
      applyToAllCustomers: true,
      message: "",
    })

    expect(result.success).toBe(false)
  })

  test("dryRun needs no confirmCount; an OFF still needs its message", () => {
    expect(
      setApplyToAllPublicRequest.safeParse({
        inboxId: "5",
        applyToAllCustomers: true,
        message: "",
        dryRun: true,
      }).success,
    ).toBe(true)
    expect(
      setApplyToAllPublicRequest.safeParse({
        inboxId: "5",
        applyToAllCustomers: false,
        message: " ",
        confirmCount: 5,
      }).success,
    ).toBe(false)
  })

  test("retry runs without a user", async () => {
    mocks.retry.mockResolvedValue({ isChanged: true, run })

    await find(
      "POST",
      `${BASE}/apply-to-all/retry`,
    )?.({
      context,
      input: { inboxId: "5" },
    })

    expect(mocks.retry).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      inboxId: "5",
      userId: null,
    })
  })

  test("getApplyToAll reports idle for a Page never switched", async () => {
    mocks.findStatus.mockResolvedValue({
      applyToAllCustomers: false,
      revision: 0,
      run: null,
    })
    mocks.findActive.mockResolvedValue(null)

    const result = await find(
      "GET",
      `${BASE}/apply-to-all`,
    )?.({
      context,
      input: { inboxId: "5" },
    })

    expect(result).toMatchObject({
      status: "idle",
      applyToAllCustomers: false,
      isAutomationActive: false,
      run: null,
    })
  })

  test("listHistory is scoped to the Page and workspace", async () => {
    mocks.listHistory.mockResolvedValue({
      data: [{ ...run, requestedBy: null }],
      pageCount: 1,
    })

    const result = await find(
      "GET",
      `${BASE}/history`,
    )?.({
      context,
      input: { inboxId: "5", page: 1, perPage: 10 },
    })

    expect(mocks.listHistory).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      inboxId: "5",
      page: 1,
      perPage: 10,
    })
    expect(result.pageCount).toBe(1)
  })

  test("an ON may omit message, including a dry run", () => {
    expect(
      setApplyToAllPublicRequest.safeParse({
        inboxId: "5",
        applyToAllCustomers: true,
        dryRun: true,
      }).success,
    ).toBe(true)
    expect(
      setApplyToAllPublicRequest.safeParse({
        inboxId: "5",
        applyToAllCustomers: true,
        confirmCount: 3,
      }).success,
    ).toBe(true)
  })

  test("an OFF without message is rejected even as a dry run", () => {
    expect(
      setApplyToAllPublicRequest.safeParse({
        inboxId: "5",
        applyToAllCustomers: false,
        dryRun: true,
      }).success,
    ).toBe(false)
  })

  test("a non-numeric gotoFlowId is a validation error, not a 500", () => {
    const base = {
      inboxId: "5",
      enabled: true,
      scheduleEnabled: false,
      timeRanges: [],
      returnMessage: null,
      pauseBotWaitingForStaff: false,
    }

    expect(
      saveAiHandoverSettingsPublicRequest.safeParse({
        ...base,
        gotoFlowId: "abc",
      }).success,
    ).toBe(false)
    expect(
      saveAiHandoverSettingsPublicRequest.safeParse({ ...base, gotoFlowId: "" })
        .success,
    ).toBe(false)
  })

  test("the settings GET result can be sent back to PUT (null return message)", () => {
    const fromGet = {
      inboxId: "5",
      enabled: true,
      scheduleEnabled: false,
      timeRanges: [],
      gotoFlowId: null,
      returnMessage: null,
      pauseBotWaitingForStaff: false,
    }

    expect(saveAiHandoverSettingsPublicRequest.safeParse(fromGet).success).toBe(
      true,
    )
    expect(
      saveAiHandoverSettingsPublicRequest.safeParse({
        ...fromGet,
        scheduleEnabled: true,
      }).success,
    ).toBe(false)
  })
})
