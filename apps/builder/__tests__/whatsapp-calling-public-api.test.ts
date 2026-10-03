// @vitest-environment node
import { describe, expect, test, vi } from "vitest"

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
  findWorkspaceIntegration: vi.fn(),
  updateSettings: vi.fn(),
  updateHours: vi.fn(),
}))
vi.mock("@chatbotx.io/business", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  integrationWhatsappService: {
    findWorkspaceIntegration: mocks.findWorkspaceIntegration,
  },
}))
vi.mock(
  "@/features/integration-whatsapp/calling/lib/calling-operations",
  () => ({
    ENGLISH_CALLING_MESSAGES: { notFound: "nf" },
    updateWhatsappCallingSettings: mocks.updateSettings,
    updateWhatsappCallHours: mocks.updateHours,
  }),
)
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

await import("@/features/integration-whatsapp/calling/api/public")

const find = (method: string, path: string) =>
  capturedProcedures.find(
    (p) => p.route.method === method && p.route.path === path,
  )?.handler
const context = { workspace: { id: "ws-1" } }
const weekday = (dayOfWeek: string) => ({
  dayOfWeek,
  ranges: [{ openMinute: 540, closeMinute: 1020 }],
})
const DAYS = [
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
  "SUNDAY",
]

describe("WhatsApp calling routes", () => {
  test("use the integrations scope", () => {
    expect(new Set(scopes)).toEqual(new Set(["integrations"]))
  })

  test("get returns the stored switches and never the credentials", async () => {
    mocks.findWorkspaceIntegration.mockResolvedValue({
      id: "3",
      auth: { tokens: { accessToken: "secret" } },
      callingEnabled: true,
      inboundCallsEnabled: true,
      callRecordingEnabled: false,
      callRecordingRetentionDays: 90,
      callTranscriptionEnabled: false,
      callHours: null,
    })

    const result = await find(
      "GET",
      "/v1/whatsapp-channels/{id}/calling",
    )?.({
      context,
      input: { id: "3" },
    })

    expect(mocks.findWorkspaceIntegration).toHaveBeenCalledWith({
      id: "3",
      workspaceId: "ws-1",
    })
    expect(JSON.stringify(result)).not.toContain("secret")
    expect(result.callRecordingRetentionDays).toBe(90)
  })

  test("get on a channel of another workspace is a 404", async () => {
    mocks.findWorkspaceIntegration.mockResolvedValue(undefined)

    await expect(
      find(
        "GET",
        "/v1/whatsapp-channels/{id}/calling",
      )?.({
        context,
        input: { id: "foreign" },
      }),
    ).rejects.toMatchObject({ code: "notFound" })
  })

  test("update delegates the fields to the shared operation in the token's workspace", async () => {
    await find(
      "PATCH",
      "/v1/whatsapp-channels/{id}/calling",
    )?.({
      context,
      input: { id: "3", recordingEnabled: true },
    })

    expect(mocks.updateSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-1",
        integrationWhatsappId: "3",
        input: { recordingEnabled: true },
      }),
    )
  })

  test("hours are re-validated with the builder's rules before anything is sent", async () => {
    const handler = find("PUT", "/v1/whatsapp-channels/{id}/calling/hours")

    await expect(
      handler?.({
        context,
        input: {
          id: "3",
          enabled: true,
          timezoneId: "Asia/Ho_Chi_Minh",
          days: DAYS.map((day) => ({ dayOfWeek: day, ranges: [] })),
        },
      }),
    ).rejects.toMatchObject({
      message: "At least one day needs an open range.",
      httpStatusCode: 422,
    })
    expect(mocks.updateHours).not.toHaveBeenCalled()

    await handler?.({
      context,
      input: {
        id: "3",
        enabled: true,
        timezoneId: "Asia/Ho_Chi_Minh",
        days: DAYS.map(weekday),
      },
    })
    expect(mocks.updateHours).toHaveBeenCalledTimes(1)
  })
})
