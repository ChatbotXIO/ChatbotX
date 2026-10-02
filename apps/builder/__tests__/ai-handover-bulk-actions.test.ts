// @vitest-environment node
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  setApplyToAll: vi.fn(),
  retry: vi.fn(),
}))

const CODES = vi.hoisted(() => ({
  automationNotActive: "aiHandoverBulkAutomationNotActive",
  messageRequired: "aiHandoverBulkMessageRequired",
  messageTooLong: "aiHandoverBulkMessageTooLong",
  pageNotConnected: "aiHandoverBulkPageNotConnected",
  nothingToRetry: "aiHandoverBulkNothingToRetry",
}))

vi.mock("@chatbotx.io/business", () => ({
  AI_HANDOVER_BULK_ERROR_CODES: CODES,
  aiHandoverBulkRunService: {
    setApplyToAll: mocks.setApplyToAll,
    retry: mocks.retry,
  },
}))

vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => key,
}))

vi.mock("@/lib/safe-action", () => ({
  workspaceActionClient: {
    bindArgsSchemas: () => ({
      inputSchema: () => ({ action: (fn: unknown) => fn }),
      action: (fn: unknown) => fn,
    }),
  },
}))

const { setApplyToAllAction: untypedSet } = await import(
  "../src/features/integration-ai-handover/actions/set-apply-to-all.action"
)
const { retryApplyToAllAction: untypedRetry } = await import(
  "../src/features/integration-ai-handover/actions/retry-apply-to-all.action"
)

type Ctx = {
  user: { id: string }
  workspaceMemberPermissions: { superAdmin?: boolean }
  isSupportSession: boolean
}
const ADMIN_CTX: Ctx = {
  user: { id: "user-1" },
  workspaceMemberPermissions: { superAdmin: true },
  isSupportSession: false,
}
type Input = { applyToAllCustomers: boolean; message: string }

const setAction = untypedSet as unknown as (props: {
  bindArgsParsedInputs: [string, string]
  parsedInput: Input
  ctx: Ctx
}) => Promise<unknown>
const retryAction = untypedRetry as unknown as (props: {
  bindArgsParsedInputs: [string, string]
  ctx: Ctx
}) => Promise<unknown>

const setWith = (input: Input, ctx: Partial<Ctx> = {}) =>
  setAction({
    bindArgsParsedInputs: ["ws-1", "inbox-1"],
    parsedInput: input,
    ctx: { ...ADMIN_CTX, ...ctx },
  })
const retryWith = (ctx: Partial<Ctx> = {}) =>
  retryAction({
    bindArgsParsedInputs: ["ws-1", "inbox-1"],
    ctx: { ...ADMIN_CTX, ...ctx },
  })

const OFF: Input = { applyToAllCustomers: false, message: "A person is here" }
const ON: Input = { applyToAllCustomers: true, message: "" }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.setApplyToAll.mockResolvedValue({ isChanged: true, run: null })
  mocks.retry.mockResolvedValue({ isChanged: true, run: null })
})

describe("setApplyToAllAction", () => {
  test("moves the bound Page's switch as the signed-in user", async () => {
    await expect(setWith(OFF)).resolves.toEqual({ isChanged: true })

    expect(mocks.setApplyToAll).toHaveBeenCalledExactlyOnceWith({
      workspaceId: "ws-1",
      inboxId: "inbox-1",
      userId: "user-1",
      applyToAllCustomers: false,
      message: "A person is here",
    })
  })

  test("reports a request for the state the Page is already in as unchanged", async () => {
    mocks.setApplyToAll.mockResolvedValue({ isChanged: false, run: null })

    await expect(setWith(ON)).resolves.toEqual({ isChanged: false })
  })

  test("refuses a member who is not a super admin before anything is requested", async () => {
    await expect(
      setWith(ON, { workspaceMemberPermissions: {} }),
    ).rejects.toThrow("errors.superAdminRequired")
    expect(mocks.setApplyToAll).not.toHaveBeenCalled()
  })

  test("refuses a platform support session, which could otherwise message real customers", async () => {
    await expect(setWith(ON, { isSupportSession: true })).rejects.toThrow(
      "aiHandover.errors.supportSession",
    )
    expect(mocks.setApplyToAll).not.toHaveBeenCalled()
  })

  test.each([
    [CODES.automationNotActive, "aiHandover.bulk.errors.automationNotActive"],
    [CODES.messageRequired, "aiHandover.bulk.errors.messageRequired"],
    [CODES.messageTooLong, "aiHandover.bulk.errors.messageTooLong"],
    [CODES.pageNotConnected, "aiHandover.bulk.errors.pageNotConnected"],
  ])("shows the service error %s translated", async (code, key) => {
    mocks.setApplyToAll.mockRejectedValue(
      new ChatbotXException("raw", code, 422),
    )

    await expect(setWith(ON)).rejects.toMatchObject({ message: key, code })
  })

  test("rethrows an error it has no copy for unchanged", async () => {
    const unknown = new ChatbotXException("bad", "validation", 422)
    mocks.setApplyToAll.mockRejectedValue(unknown)
    await expect(setWith(ON)).rejects.toBe(unknown)

    const boom = new Error("db down")
    mocks.setApplyToAll.mockRejectedValue(boom)
    await expect(setWith(ON)).rejects.toBe(boom)
  })
})

describe("retryApplyToAllAction", () => {
  test("retries the bound Page as the signed-in user", async () => {
    await retryWith()

    expect(mocks.retry).toHaveBeenCalledExactlyOnceWith({
      workspaceId: "ws-1",
      inboxId: "inbox-1",
      userId: "user-1",
    })
  })

  test("refuses a non super admin and a support session before retrying", async () => {
    await expect(retryWith({ workspaceMemberPermissions: {} })).rejects.toThrow(
      "errors.superAdminRequired",
    )
    await expect(retryWith({ isSupportSession: true })).rejects.toThrow(
      "aiHandover.errors.supportSession",
    )
    expect(mocks.retry).not.toHaveBeenCalled()
  })

  test("shows 'nothing to retry' translated and rethrows anything else", async () => {
    mocks.retry.mockRejectedValue(
      new ChatbotXException("raw", CODES.nothingToRetry, 422),
    )
    await expect(retryWith()).rejects.toMatchObject({
      message: "aiHandover.bulk.errors.nothingToRetry",
    })

    const boom = new Error("db down")
    mocks.retry.mockRejectedValue(boom)
    await expect(retryWith()).rejects.toBe(boom)
  })
})
