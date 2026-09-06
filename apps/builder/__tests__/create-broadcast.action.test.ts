// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  mockCreate,
  mockReturnValidationErrors,
  mockGetCurrentUserAndTargetWorkspace,
} = vi.hoisted(() => ({
  mockCreate: vi.fn(),
  mockReturnValidationErrors: vi.fn((_schema: unknown, errs: unknown) => ({
    __validationError: errs,
  })),
  mockGetCurrentUserAndTargetWorkspace: vi.fn().mockResolvedValue({
    targetWorkspaceMember: { permissions: ["emailAndPhone"] },
  }),
}))

vi.mock("@/lib/safe-action", () => {
  const chain: Record<string, unknown> = {}
  chain.bindArgsSchemas = () => chain
  chain.inputSchema = () => chain
  chain.action = (fn: unknown) => fn
  return { workspaceActionClient: chain }
})

vi.mock("@chatbotx.io/business", () => ({
  broadcastService: { create: mockCreate },
}))

vi.mock("next-safe-action", () => ({
  returnValidationErrors: mockReturnValidationErrors,
}))

vi.mock("@/lib/auth/utils", () => ({
  getCurrentUserAndTargetWorkspace: mockGetCurrentUserAndTargetWorkspace,
}))

vi.mock("@/features/contacts/permissions", () => ({
  canViewContactEmailAndPhone: vi.fn(() => true),
}))

vi.mock("@/features/common/schema", () => ({
  workspaceIdrequestParams: [],
}))

vi.mock("../src/features/broadcasts/schema/action", () => ({
  createBroadcastRequest: { __schema: "createBroadcastRequest" },
}))

const { createBroadcastAction } = await import(
  "../src/features/broadcasts/actions/create-broadcast.action"
)

const WORKSPACE_ID = "ws-1"

type Handler = (props: unknown) => Promise<unknown>
const callAction = createBroadcastAction as unknown as Handler

const baseInput = {
  channel: "whatsapp" as const,
  subaction: "whatsappWithin24Hours" as const,
  schedulesType: "now" as const,
  schedulesAt: null,
  contactFilter: null,
}

const validationError = (field: string, message: string) =>
  Object.assign(new Error(message), { code: "validation", field })

beforeEach(() => {
  vi.clearAllMocks()
  mockGetCurrentUserAndTargetWorkspace.mockResolvedValue({
    targetWorkspaceMember: { permissions: ["emailAndPhone"] },
  })
})

describe("createBroadcastAction — validation branches map to returnValidationErrors", () => {
  test("channel", async () => {
    mockCreate.mockRejectedValue(
      validationError("channel", "Unsupported broadcast channel"),
    )

    const result = await callAction({
      bindArgsParsedInputs: [WORKSPACE_ID],
      parsedInput: { ...baseInput, channel: "webchat" },
    })

    expect(mockReturnValidationErrors).toHaveBeenCalledOnce()
    const [, errors] = mockReturnValidationErrors.mock.calls[0] as [
      unknown,
      { channel: { _errors: string[] } },
    ]
    expect(errors.channel._errors).toContain("Unsupported broadcast channel")
    expect(result).toMatchObject({ __validationError: expect.anything() })
  })

  test("subaction", async () => {
    mockCreate.mockRejectedValue(
      validationError("subaction", "Unsupported broadcast subaction"),
    )

    const result = await callAction({
      bindArgsParsedInputs: [WORKSPACE_ID],
      parsedInput: baseInput,
    })

    const [, errors] = mockReturnValidationErrors.mock.calls[0] as [
      unknown,
      { subaction: { _errors: string[] } },
    ]
    expect(errors.subaction._errors).toContain(
      "Unsupported broadcast subaction",
    )
    expect(result).toMatchObject({ __validationError: expect.anything() })
  })

  test("flowId — neither flow nor template selected", async () => {
    mockCreate.mockRejectedValue(
      validationError("flowId", "Either flow or template must be selected"),
    )

    const result = await callAction({
      bindArgsParsedInputs: [WORKSPACE_ID],
      parsedInput: baseInput,
    })

    const [, errors] = mockReturnValidationErrors.mock.calls[0] as [
      unknown,
      { flowId: { _errors: string[] } },
    ]
    expect(errors.flowId._errors).toContain(
      "Either flow or template must be selected",
    )
    expect(result).toMatchObject({ __validationError: expect.anything() })
  })

  test("flowId — flow not found", async () => {
    mockCreate.mockRejectedValue(validationError("flowId", "Flow not found"))

    const result = await callAction({
      bindArgsParsedInputs: [WORKSPACE_ID],
      parsedInput: { ...baseInput, flowId: "flow-123" },
    })

    const [, errors] = mockReturnValidationErrors.mock.calls[0] as [
      unknown,
      { flowId: { _errors: string[] } },
    ]
    expect(errors.flowId._errors).toContain("Flow not found")
    expect(result).toMatchObject({ __validationError: expect.anything() })
  })

  test("templateId — unsupported for channel", async () => {
    mockCreate.mockRejectedValue(
      validationError(
        "templateId",
        "Template broadcasts are not supported for this channel",
      ),
    )

    const result = await callAction({
      bindArgsParsedInputs: [WORKSPACE_ID],
      parsedInput: {
        ...baseInput,
        channel: "tiktok",
        templateId: "template-1",
      },
    })

    const [, errors] = mockReturnValidationErrors.mock.calls[0] as [
      unknown,
      { templateId: { _errors: string[] } },
    ]
    expect(errors.templateId._errors).toContain(
      "Template broadcasts are not supported for this channel",
    )
    expect(result).toMatchObject({ __validationError: expect.anything() })
  })

  test("templateId — template not found", async () => {
    mockCreate.mockRejectedValue(
      validationError("templateId", "Template not found"),
    )

    const result = await callAction({
      bindArgsParsedInputs: [WORKSPACE_ID],
      parsedInput: { ...baseInput, templateId: "tpl-1" },
    })

    const [, errors] = mockReturnValidationErrors.mock.calls[0] as [
      unknown,
      { templateId: { _errors: string[] } },
    ]
    expect(errors.templateId._errors).toContain("Template not found")
    expect(result).toMatchObject({ __validationError: expect.anything() })
  })

  test("integrationMessengerId — not owned by workspace", async () => {
    mockCreate.mockRejectedValue(
      validationError("integrationMessengerId", "Integration not found"),
    )

    const result = await callAction({
      bindArgsParsedInputs: [WORKSPACE_ID],
      parsedInput: {
        ...baseInput,
        channel: "messenger",
        flowId: "flow-1",
        integrationMessengerId: "foreign-int",
      },
    })

    const [, errors] = mockReturnValidationErrors.mock.calls[0] as [
      unknown,
      { integrationMessengerId: { _errors: string[] } },
    ]
    expect(errors.integrationMessengerId._errors).toContain(
      "Integration not found",
    )
    expect(result).toMatchObject({ __validationError: expect.anything() })
  })

  test("integrationWhatsappId — not owned by workspace", async () => {
    mockCreate.mockRejectedValue(
      validationError("integrationWhatsappId", "Integration not found"),
    )

    const result = await callAction({
      bindArgsParsedInputs: [WORKSPACE_ID],
      parsedInput: {
        ...baseInput,
        flowId: "flow-1",
        integrationWhatsappId: "foreign-wa-int",
      },
    })

    const [, errors] = mockReturnValidationErrors.mock.calls[0] as [
      unknown,
      { integrationWhatsappId: { _errors: string[] } },
    ]
    expect(errors.integrationWhatsappId._errors).toContain(
      "Integration not found",
    )
    expect(result).toMatchObject({ __validationError: expect.anything() })
  })
})

describe("createBroadcastAction — happy path", () => {
  test("passes canViewEmailAndPhone derived from the session and returns the created broadcast", async () => {
    const mockBroadcast = { id: "bc-1", name: "Broadcast" }
    mockCreate.mockResolvedValue(mockBroadcast)

    const result = await callAction({
      bindArgsParsedInputs: [WORKSPACE_ID],
      parsedInput: { ...baseInput, flowId: "flow-1" },
    })

    expect(result).toBe(mockBroadcast)
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: WORKSPACE_ID,
        flowId: "flow-1",
        canViewEmailAndPhone: true,
      }),
    )
  })

  test("canViewEmailAndPhone is false when there is no session", async () => {
    mockGetCurrentUserAndTargetWorkspace.mockResolvedValue(null)
    mockCreate.mockResolvedValue({ id: "bc-2" })

    await callAction({
      bindArgsParsedInputs: [WORKSPACE_ID],
      parsedInput: { ...baseInput, flowId: "flow-1" },
    })

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ canViewEmailAndPhone: false }),
    )
  })

  test("propagates a non-validation error", async () => {
    mockCreate.mockRejectedValue(new Error("boom"))

    await expect(
      callAction({
        bindArgsParsedInputs: [WORKSPACE_ID],
        parsedInput: { ...baseInput, flowId: "flow-1" },
      }),
    ).rejects.toThrow("boom")
  })
})
