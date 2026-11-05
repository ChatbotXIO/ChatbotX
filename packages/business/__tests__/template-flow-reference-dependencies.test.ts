// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  calendars: vi.fn(),
  webchats: vi.fn(),
  aiFunctions: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  db: {
    query: {
      appointmentCalendarModel: { findMany: mocks.calendars },
      integrationWebchatModel: { findMany: mocks.webchats },
      aiFunctionModel: { findMany: mocks.aiFunctions },
    },
  },
}))

const { calendarsAdapter } = await import("../src/template/adapters/calendars")
const { webchatsAdapter } = await import("../src/template/adapters/webchats")
const { aiFunctionsAdapter } = await import(
  "../src/template/adapters/ai-functions"
)

const flows = (...sourceIds: string[]) =>
  sourceIds.map((sourceId) => ({ category: "flows", sourceId }))

beforeEach(() => {
  vi.clearAllMocks()
})

// A resource copied without the flow it runs would silently stop working in
// the target, so every flow it points at travels with it (like a keyword's).
describe("flows a copied resource runs are hard dependencies", () => {
  test("a calendar takes its reminder, confirmation and cancellation flows, once each", async () => {
    mocks.calendars.mockResolvedValue([
      {
        id: "c1",
        confirmationFlowId: "f-confirm",
        cancellationFlowId: "f-cancel",
        availability: [],
        reminders: [{ flowId: "f-remind" }, { flowId: "f-confirm" }],
      },
      {
        id: "c2",
        confirmationFlowId: null,
        cancellationFlowId: null,
        availability: [],
        reminders: [],
      },
    ])

    const result = await calendarsAdapter.collector.collect("ws-1", [
      "c1",
      "c2",
    ])

    expect(result.hardDependencies).toEqual(
      flows("f-remind", "f-confirm", "f-cancel"),
    )
  })

  test("a webchat takes its welcome flow", async () => {
    mocks.webchats.mockResolvedValue([
      { id: "w1", welcomeFlowId: "f-welcome" },
      { id: "w2", welcomeFlowId: null },
    ])

    const result = await webchatsAdapter.collector.collect("ws-1", ["w1", "w2"])

    expect(result.hardDependencies).toEqual(flows("f-welcome"))
  })

  test("an AI function takes the flow it triggers", async () => {
    mocks.aiFunctions.mockResolvedValue([
      { id: "a1", triggerFlowId: "f-trigger" },
      { id: "a2", triggerFlowId: null },
    ])

    const result = await aiFunctionsAdapter.collector.collect("ws-1", [
      "a1",
      "a2",
    ])

    expect(result.hardDependencies).toEqual(flows("f-trigger"))
  })
})
