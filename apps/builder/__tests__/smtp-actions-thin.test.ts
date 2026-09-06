// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  auditRecord: vi.fn(),
  connect: vi.fn(),
  findByIdForWorkspace: vi.fn(),
  findWorkspace: vi.fn(),
  isSameJsonValue: vi.fn(),
  update: vi.fn(),
  verifySmtpConnection: vi.fn(),
}))

const callOrder: string[] = []

vi.mock("@/lib/safe-action", () => {
  const chain: Record<string, unknown> = {}
  chain.bindArgsSchemas = () => chain
  chain.inputSchema = () => chain
  chain.action = (fn: unknown) => fn
  return {
    workspaceActionClient: chain,
  }
})

vi.mock("@chatbotx.io/business", () => ({
  integrationSmtpService: {
    connect: mocks.connect,
    findByIdForWorkspace: mocks.findByIdForWorkspace,
    update: mocks.update,
  },
  workspaceService: { find: mocks.findWorkspace },
}))

vi.mock("@chatbotx.io/business/audit", () => ({
  auditService: { record: mocks.auditRecord },
  isSameJsonValue: mocks.isSameJsonValue,
}))

vi.mock("../src/features/integration-smtp/lib/verify-connection", () => ({
  verifySmtpConnection: (...args: unknown[]) => {
    callOrder.push("verify")
    return Promise.resolve(mocks.verifySmtpConnection(...args))
  },
}))

const { createSmtpAction } = await import(
  "../src/features/integration-smtp/actions/create-smtp.action"
)
const { updateSmtpAction } = await import(
  "../src/features/integration-smtp/actions/update-smtp.action"
)

beforeEach(() => {
  vi.clearAllMocks()
  callOrder.length = 0
  mocks.findWorkspace.mockResolvedValue({ id: "ws-1", ownerId: "owner-1" })
  mocks.connect.mockImplementation(() => {
    callOrder.push("connect")
    return Promise.resolve({ inbox: { id: "inbox-1" }, wasCreated: true })
  })
  mocks.findByIdForWorkspace.mockResolvedValue({
    id: "smtp-1",
    name: "old-name",
    fromAddress: "old@example.com",
    auth: {
      authType: "custom",
      provider: "google",
      host: "smtp.gmail.com",
      port: 587,
      username: "old-user",
      password: "old-pass",
    },
  })
  mocks.update.mockResolvedValue({
    id: "smtp-1",
    name: "new-name",
    fromAddress: "new@example.com",
  })
})

describe("createSmtpAction", () => {
  test("calls verifySmtpConnection before integrationSmtpService.connect", async () => {
    await (createSmtpAction as (props: unknown) => Promise<unknown>)({
      bindArgsParsedInputs: ["ws-1"],
      parsedInput: {
        provider: "google",
        host: "ignored.example.com",
        port: 25,
        username: "user1",
        password: "pass1",
        fromAddress: "from@example.com",
      },
    })

    expect(callOrder).toEqual(["verify", "connect"])
  })

  test("a non-other provider passes smtpHostMap-resolved host/port", async () => {
    await (createSmtpAction as (props: unknown) => Promise<unknown>)({
      bindArgsParsedInputs: ["ws-1"],
      parsedInput: {
        provider: "google",
        host: "ignored.example.com",
        port: 25,
        username: "user1",
        password: "pass1",
        fromAddress: "from@example.com",
      },
    })

    expect(mocks.connect).toHaveBeenCalledWith(
      expect.objectContaining({
        auth: expect.objectContaining({
          host: "smtp.gmail.com",
          port: 587,
        }),
      }),
    )
  })
})

describe("updateSmtpAction", () => {
  test("records an audit only when isSameJsonValue reports a change", async () => {
    mocks.isSameJsonValue.mockReturnValue(false)

    await (updateSmtpAction as (props: unknown) => Promise<unknown>)({
      bindArgsParsedInputs: ["ws-1", "smtp-1"],
      parsedInput: {
        provider: "google",
        host: "",
        port: 0,
        username: "new-user",
        password: "new-pass",
        fromAddress: "new@example.com",
      },
    })

    expect(mocks.auditRecord).toHaveBeenCalledTimes(1)

    mocks.auditRecord.mockClear()
    mocks.isSameJsonValue.mockReturnValue(true)

    await (updateSmtpAction as (props: unknown) => Promise<unknown>)({
      bindArgsParsedInputs: ["ws-1", "smtp-1"],
      parsedInput: {
        provider: "google",
        host: "",
        port: 0,
        username: "old-user",
        password: "old-pass",
        fromAddress: "old@example.com",
      },
    })

    expect(mocks.auditRecord).not.toHaveBeenCalled()
  })
})
