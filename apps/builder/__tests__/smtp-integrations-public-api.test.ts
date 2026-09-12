// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

type RouteConfig = {
  method: string
  path: string
  summary: string
  tags: string[]
  successStatus?: number
}

type ProcedureHandler = (...args: unknown[]) => unknown

type CapturedProcedure = {
  route: RouteConfig
  handler?: ProcedureHandler
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
      handler: vi.fn((fn: ProcedureHandler) => {
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

const integrationSmtpService = {
  listByWorkspace: vi.fn(),
  findByIdForWorkspace: vi.fn(),
  connect: vi.fn(),
  update: vi.fn(),
  disconnect: vi.fn(),
}
vi.mock("@chatbotx.io/business", () => ({ integrationSmtpService }))

const callOrder: string[] = []
const verifySmtpConnection = vi.fn()
// `verifySmtpConnection` opens a real SMTP connection via nodemailer and
// resolves i18n through `next-intl/server` — neither is reachable from this
// test, so it's stubbed like the action-level `smtp-actions-thin.test.ts`.
// `resolveSmtpHostAndPort` stays real: it is a pure `smtpHostMap` lookup.
vi.mock("../src/features/integration-smtp/lib/verify-connection", () => ({
  verifySmtpConnection: (...args: unknown[]) => {
    callOrder.push("verify")
    return Promise.resolve(verifySmtpConnection(...args))
  },
}))

await import("@/features/integration-smtp/api/public")

const findProcedure = (method: string, path: string) => {
  const found = capturedProcedures.find(
    (procedure) =>
      procedure.route.method === method && procedure.route.path === path,
  )
  if (!found) {
    throw new Error(`No procedure registered for ${method} ${path}`)
  }
  return found
}

const scopeArgAtImport = workspaceTokenAuthAPIForScope.mock.calls[0]?.[0]
const context = { workspace: { id: "workspace-1", ownerId: "owner-1" } }

beforeEach(() => {
  vi.clearAllMocks()
  callOrder.length = 0
})

test("registers the smtp integrations public router under the channels scope", () => {
  expect(scopeArgAtImport).toBe("channels")
})

describe("POST /v1/smtp-integrations", () => {
  const procedure = findProcedure("POST", "/v1/smtp-integrations")
  const input = {
    provider: "google" as const,
    host: "ignored.example.com",
    port: 25,
    username: "user1",
    password: "super-secret",
    fromAddress: "from@example.com",
  }

  test("calls verifySmtpConnection before integrationSmtpService.connect", async () => {
    integrationSmtpService.connect.mockImplementationOnce(() => {
      callOrder.push("connect")
      return Promise.resolve({ smtpId: "smtp-1" })
    })
    integrationSmtpService.findByIdForWorkspace.mockResolvedValueOnce({
      id: "smtp-1",
      name: "user1",
      fromAddress: "from@example.com",
      auth: { authType: "custom", password: "super-secret" },
    })

    await procedure.handler?.({ context, input })

    expect(callOrder).toEqual(["verify", "connect"])
  })

  test("resolves host/port via smtpHostMap for a non-other provider", async () => {
    integrationSmtpService.connect.mockResolvedValueOnce({ smtpId: "smtp-1" })
    integrationSmtpService.findByIdForWorkspace.mockResolvedValueOnce({
      id: "smtp-1",
      name: "user1",
      fromAddress: "from@example.com",
      auth: {},
    })

    await procedure.handler?.({ context, input })

    expect(integrationSmtpService.connect).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "workspace-1",
        ownerId: "owner-1",
        auth: expect.objectContaining({
          host: "smtp.gmail.com",
          port: 587,
        }),
      }),
    )
  })

  test("returns only { id, name, fromAddress } even though the row carries the password", async () => {
    integrationSmtpService.connect.mockResolvedValueOnce({ smtpId: "smtp-1" })
    integrationSmtpService.findByIdForWorkspace.mockResolvedValueOnce({
      id: "smtp-1",
      name: "user1",
      fromAddress: "from@example.com",
      inboxId: "inbox-1",
      workspaceId: "workspace-1",
      auth: { authType: "custom", password: "super-secret" },
    })

    await expect(procedure.handler?.({ context, input })).resolves.toEqual({
      id: "smtp-1",
      name: "user1",
      fromAddress: "from@example.com",
    })
  })
})

describe("PUT /v1/smtp-integrations/{id}", () => {
  const procedure = findProcedure("PUT", "/v1/smtp-integrations/{id}")

  test("calls verifySmtpConnection before integrationSmtpService.update", async () => {
    integrationSmtpService.update.mockImplementationOnce(() => {
      callOrder.push("update")
      return Promise.resolve({
        id: "smtp-1",
        name: "user1",
        fromAddress: "from@example.com",
        auth: {},
      })
    })

    await procedure.handler?.({
      context,
      input: {
        id: "smtp-1",
        provider: "google",
        host: "ignored.example.com",
        port: 25,
        username: "user1",
        password: "super-secret",
        fromAddress: "from@example.com",
      },
    })

    expect(callOrder).toEqual(["verify", "update"])
  })
})

describe("DELETE /v1/smtp-integrations/{id}", () => {
  const procedure = findProcedure("DELETE", "/v1/smtp-integrations/{id}")

  test("disconnects using the looked-up row's inboxId and the token workspace's ownerId", async () => {
    integrationSmtpService.findByIdForWorkspace.mockResolvedValueOnce({
      id: "smtp-1",
      inboxId: "inbox-1",
    })

    await procedure.handler?.({ context, input: { id: "smtp-1" } })

    expect(integrationSmtpService.disconnect).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      id: "smtp-1",
      inboxId: "inbox-1",
      ownerId: "owner-1",
    })
  })
})
