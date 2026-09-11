// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  auditRecord: vi.fn(),
  connect: vi.fn(),
  disconnect: vi.fn(),
  findByIdForWorkspace: vi.fn(),
  findWorkspace: vi.fn(),
  findWorkspaceById: vi.fn(),
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
    disconnect: mocks.disconnect,
    findByIdForWorkspace: mocks.findByIdForWorkspace,
    update: mocks.update,
  },
  workspaceService: {
    find: mocks.findWorkspace,
    findById: mocks.findWorkspaceById,
  },
}))

// Audit records for SMTP live in `integrationSmtpService`, not in these
// actions — the actions must never call `auditService` themselves, or a
// public-API/worker caller of the same service method would get no audit
// trail. This mock exists purely to assert that they don't.
vi.mock("@chatbotx.io/business/audit", () => ({
  auditService: { record: mocks.auditRecord },
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
const { deleteSmtpAction } = await import(
  "../src/features/integration-smtp/actions/delete-smtp.action"
)

beforeEach(() => {
  vi.clearAllMocks()
  callOrder.length = 0
  mocks.findWorkspace.mockResolvedValue({ id: "ws-1", ownerId: "owner-1" })
  mocks.findWorkspaceById.mockResolvedValue({ id: "ws-1", ownerId: "owner-1" })
  mocks.connect.mockImplementation(() => {
    callOrder.push("connect")
    return Promise.resolve({ inbox: { id: "inbox-1" }, wasCreated: true })
  })
  mocks.findByIdForWorkspace.mockResolvedValue({
    id: "smtp-1",
    inboxId: "inbox-1",
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

  test("does not record the connect audit itself", async () => {
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

    expect(mocks.auditRecord).not.toHaveBeenCalled()
  })
})

describe("updateSmtpAction", () => {
  const parsedInput = {
    provider: "google",
    host: "ignored.example.com",
    port: 25,
    username: "new-user",
    password: "new-pass",
    fromAddress: "new@example.com",
  }

  const run = () =>
    (updateSmtpAction as (props: unknown) => Promise<unknown>)({
      bindArgsParsedInputs: ["ws-1", "smtp-1"],
      parsedInput,
    })

  test("verifies the connection before calling the service", async () => {
    mocks.update.mockImplementation(() => {
      callOrder.push("update")
      return Promise.resolve({ id: "smtp-1" })
    })

    await run()

    expect(callOrder).toEqual(["verify", "update"])
  })

  // `smtpHostMap` lives in `@chatbotx.io/integration-smtp`, which business must
  // not depend on, so the action resolves host/port and hands the pair over.
  test("passes smtpHostMap-resolved host/port into the service", async () => {
    await run()

    expect(mocks.update).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      id: "smtp-1",
      data: expect.objectContaining({
        host: "smtp.gmail.com",
        port: 587,
        username: "new-user",
        password: "new-pass",
        fromAddress: "new@example.com",
      }),
    })
  })

  // Merging against the stored auth, the change diff and the audit record all
  // belong to `integrationSmtpService.update`.
  test("neither reads the current row nor records an audit itself", async () => {
    await run()

    expect(mocks.findByIdForWorkspace).not.toHaveBeenCalled()
    expect(mocks.auditRecord).not.toHaveBeenCalled()
  })
})

describe("deleteSmtpAction", () => {
  test("resolves the row and owner, then delegates without auditing", async () => {
    await (deleteSmtpAction as (props: unknown) => Promise<unknown>)({
      bindArgsParsedInputs: ["ws-1", "smtp-1"],
    })

    expect(mocks.disconnect).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      id: "smtp-1",
      inboxId: "inbox-1",
      ownerId: "owner-1",
    })
    expect(mocks.auditRecord).not.toHaveBeenCalled()
  })
})
