// @vitest-environment node
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  save: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  aiHandoverBulkRunService: { saveSettings: mocks.save },
}))

vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => key,
}))

vi.mock("@/lib/safe-action", () => ({
  workspaceActionClient: {
    bindArgsSchemas: () => ({
      inputSchema: () => ({ action: (fn: unknown) => fn }),
    }),
  },
}))

const { saveAiHandoverSettingsAction: untypedAction } = await import(
  "../src/features/integration-ai-handover/actions/save-ai-handover-settings.action"
)

type Input = {
  enabled: boolean
  scheduleEnabled: boolean
  timeRanges: { from: number; to: number }[]
  gotoFlowId: string | null
  returnMessage: string
  pauseBotWaitingForStaff: boolean
}
type Ctx = {
  workspaceMemberPermissions: { superAdmin?: boolean }
  isSupportSession: boolean
}
const saveAiHandoverSettingsAction = untypedAction as unknown as (props: {
  bindArgsParsedInputs: [string, string]
  parsedInput: Input
  ctx: Ctx
}) => Promise<unknown>

const INPUT: Input = {
  enabled: true,
  scheduleEnabled: true,
  timeRanges: [{ from: 8, to: 17 }],
  gotoFlowId: "flow-1",
  returnMessage: "Back with you",
  pauseBotWaitingForStaff: true,
}
const ADMIN_CTX: Ctx = {
  workspaceMemberPermissions: { superAdmin: true },
  isSupportSession: false,
}

const run = (overrides: { input?: Partial<Input>; ctx?: Partial<Ctx> } = {}) =>
  saveAiHandoverSettingsAction({
    bindArgsParsedInputs: ["ws-1", "inbox-1"],
    parsedInput: { ...INPUT, ...overrides.input },
    ctx: { ...ADMIN_CTX, ...overrides.ctx },
  })

beforeEach(() => {
  vi.clearAllMocks()
  mocks.save.mockImplementation(async (input) => ({
    ...input,
    returnMessage: input.returnMessage || null,
  }))
})

describe("saveAiHandoverSettingsAction", () => {
  test("saves for the bound workspace and Page", async () => {
    await expect(run()).resolves.toEqual(INPUT)
    expect(mocks.save).toHaveBeenCalledExactlyOnceWith({
      ...INPUT,
      workspaceId: "ws-1",
      inboxId: "inbox-1",
    })
  })

  test("returns an empty string for a cleared return message", async () => {
    await expect(run({ input: { returnMessage: "" } })).resolves.toMatchObject({
      returnMessage: "",
    })
  })

  test("refuses a member who is not a super admin before any write", async () => {
    await expect(
      run({ ctx: { workspaceMemberPermissions: {} } }),
    ).rejects.toThrow("errors.superAdminRequired")
    expect(mocks.save).not.toHaveBeenCalled()
  })

  test("refuses a platform support session even though it carries superAdmin", async () => {
    await expect(run({ ctx: { isSupportSession: true } })).rejects.toThrow(
      "aiHandover.errors.supportSession",
    )
    expect(mocks.save).not.toHaveBeenCalled()
  })

  test("maps a missing or inactive flow to a translated error", async () => {
    mocks.save.mockRejectedValue(
      new ChatbotXException("Flow not found", "notFound", 404),
    )
    await expect(run()).rejects.toThrow("aiHandover.errors.flowNotFound")
  })

  test("rethrows another domain error (not a missing flow) unchanged", async () => {
    const error = new ChatbotXException("bad", "validation", 422)
    mocks.save.mockRejectedValue(error)
    await expect(run()).rejects.toBe(error)
  })

  test("rethrows any other failure unchanged", async () => {
    const boom = new Error("database down")
    mocks.save.mockRejectedValue(boom)
    await expect(run()).rejects.toBe(boom)
  })
})
