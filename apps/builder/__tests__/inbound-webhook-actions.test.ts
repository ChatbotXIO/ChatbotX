// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

const service = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
  updateSettings: vi.fn(),
  regenerateToken: vi.fn(),
  deleteMany: vi.fn(),
  findOrFail: vi.fn(),
  findRequestOrFail: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({ inboundWebhookService: service }))
vi.mock("@chatbotx.io/utils", () => ({
  zodBigintAsString: () => ({ describe: () => ({}) }),
}))
vi.mock("@/features/common/schema", () => ({
  workspaceIdrequestParams: [],
  workspaceIdAndIdRequestParams: [],
  bulkUpdateIdsRequest: {},
}))
vi.mock("../src/features/inbound-webhooks/schema/action", () => ({
  createInboundWebhookRequest: {},
  inboundWebhookConfigRequest: {},
  updateInboundWebhookSettingsRequest: {},
}))
vi.mock("../src/features/inbound-webhooks/schema/public", () => ({
  toInboundWebhookRequestDetail: (request: unknown) => request,
}))

// `action(fn)` hands back the handler so the tests can call it directly.
vi.mock("@/lib/safe-action", () => {
  const chain = {
    bindArgsSchemas: () => chain,
    inputSchema: () => chain,
    action: (fn: unknown) => fn,
  }
  return {
    workspaceActionClient: chain,
    workspaceActionClientAllowExpired: chain,
  }
})

type Handler = (props: unknown) => Promise<unknown>

const SUPER_ADMIN_ERROR = /super admin/

const handlers: Record<string, () => Promise<Handler>> = {
  createInboundWebhookAction: async () =>
    (
      await import(
        "../src/features/inbound-webhooks/actions/create-inbound-webhook.action"
      )
    ).createInboundWebhookAction as unknown as Handler,
  updateInboundWebhookAction: async () =>
    (
      await import(
        "../src/features/inbound-webhooks/actions/update-inbound-webhook.action"
      )
    ).updateInboundWebhookAction as unknown as Handler,
  updateInboundWebhookSettingsAction: async () =>
    (
      await import(
        "../src/features/inbound-webhooks/actions/update-inbound-webhook-settings.action"
      )
    ).updateInboundWebhookSettingsAction as unknown as Handler,
  regenerateInboundWebhookTokenAction: async () =>
    (
      await import(
        "../src/features/inbound-webhooks/actions/regenerate-inbound-webhook-token.action"
      )
    ).regenerateInboundWebhookTokenAction as unknown as Handler,
  deleteInboundWebhooksAction: async () =>
    (
      await import(
        "../src/features/inbound-webhooks/actions/delete-inbound-webhooks.action"
      )
    ).deleteInboundWebhooksAction as unknown as Handler,
  getInboundWebhookTokenAction: async () =>
    (
      await import(
        "../src/features/inbound-webhooks/actions/get-inbound-webhook-token.action"
      )
    ).getInboundWebhookTokenAction as unknown as Handler,
  getInboundWebhookRequestAction: async () =>
    (
      await import(
        "../src/features/inbound-webhooks/actions/get-inbound-webhook-request.action"
      )
    ).getInboundWebhookRequestAction as unknown as Handler,
}

const load = (exportName: string): Promise<Handler> => {
  const loader = handlers[exportName]
  if (!loader) {
    throw new Error(`No loader for ${exportName}`)
  }
  return loader()
}

const superAdmin = { superAdmin: true }
const regularMember = { superAdmin: false }

type Case = {
  exportName: string
  props: (permissions: object) => unknown
  serviceCall: keyof typeof service
}

const cases: Case[] = [
  {
    exportName: "createInboundWebhookAction",
    props: (permissions) => ({
      bindArgsParsedInputs: ["ws-1"],
      parsedInput: { name: "CRM" },
      ctx: { workspaceMemberPermissions: permissions },
    }),
    serviceCall: "create",
  },
  {
    exportName: "updateInboundWebhookAction",
    props: (permissions) => ({
      bindArgsParsedInputs: ["ws-1", "1"],
      parsedInput: { sampleJson: undefined },
      ctx: { workspaceMemberPermissions: permissions },
    }),
    serviceCall: "update",
  },
  {
    exportName: "updateInboundWebhookSettingsAction",
    props: (permissions) => ({
      bindArgsParsedInputs: ["ws-1", "1"],
      parsedInput: { active: true },
      ctx: { workspaceMemberPermissions: permissions },
    }),
    serviceCall: "updateSettings",
  },
  {
    exportName: "regenerateInboundWebhookTokenAction",
    props: (permissions) => ({
      bindArgsParsedInputs: ["ws-1", "1"],
      ctx: { workspaceMemberPermissions: permissions },
    }),
    serviceCall: "regenerateToken",
  },
  {
    exportName: "deleteInboundWebhooksAction",
    props: (permissions) => ({
      bindArgsParsedInputs: ["ws-1"],
      parsedInput: { ids: ["1"] },
      ctx: { workspaceMemberPermissions: permissions },
    }),
    serviceCall: "deleteMany",
  },
  {
    exportName: "getInboundWebhookTokenAction",
    props: (permissions) => ({
      bindArgsParsedInputs: ["ws-1", "1"],
      ctx: { workspaceMemberPermissions: permissions },
    }),
    serviceCall: "findOrFail",
  },
  {
    exportName: "getInboundWebhookRequestAction",
    props: (permissions) => ({
      bindArgsParsedInputs: ["ws-1", "1", "9"],
      ctx: { workspaceMemberPermissions: permissions },
    }),
    serviceCall: "findRequestOrFail",
  },
]

beforeEach(() => {
  vi.clearAllMocks()
  service.create.mockResolvedValue({ id: "1" })
  service.findOrFail.mockResolvedValue({ token: "iwh_x" })
})

describe.each(cases)("$exportName", ({ exportName, props, serviceCall }) => {
  test("rejects a member who is not a super admin without touching the service", async () => {
    const action = await load(exportName)

    await expect(action(props(regularMember))).rejects.toThrow(
      SUPER_ADMIN_ERROR,
    )
    expect(service[serviceCall]).not.toHaveBeenCalled()
  })

  test("rejects a member whose permissions are empty (fail closed)", async () => {
    const action = await load(exportName)

    await expect(action(props({}))).rejects.toThrow(SUPER_ADMIN_ERROR)
    expect(service[serviceCall]).not.toHaveBeenCalled()
  })

  test("calls the service for a super admin", async () => {
    const action = await load(exportName)

    await action(props(superAdmin))

    expect(service[serviceCall]).toHaveBeenCalledTimes(1)
  })
})

describe("createInboundWebhookAction", () => {
  test("returns only the new id so the client can open the editor", async () => {
    const action = await load("createInboundWebhookAction")

    await expect(action(cases[0]?.props(superAdmin))).resolves.toEqual({
      id: "1",
    })
    expect(service.create).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      name: "CRM",
    })
  })
})

describe("getInboundWebhookTokenAction", () => {
  test("returns just the token, nothing else of the row", async () => {
    service.findOrFail.mockResolvedValue({ token: "iwh_x", name: "CRM" })
    const action = await load("getInboundWebhookTokenAction")

    await expect(action(cases[5]?.props(superAdmin))).resolves.toEqual({
      token: "iwh_x",
    })
  })
})
