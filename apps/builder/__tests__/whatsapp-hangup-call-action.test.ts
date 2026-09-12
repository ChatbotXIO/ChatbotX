// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

type ActionHandler = (args: {
  bindArgsParsedInputs: readonly [string]
  parsedInput: Record<string, unknown>
}) => Promise<unknown>

const { findByIdMock, findByInboxIdForWorkspaceMock, runMock } = vi.hoisted(
  () => ({
    findByIdMock: vi.fn(),
    findByInboxIdForWorkspaceMock: vi.fn(),
    runMock: vi.fn(),
  }),
)

vi.mock("@/lib/safe-action", () => {
  const chain: Record<string, unknown> = {}
  chain.bindArgsSchemas = () => chain
  chain.inputSchema = () => chain
  chain.action = (handler: unknown) => handler
  return { workspaceActionClient: chain }
})

vi.mock("@chatbotx.io/business", () => ({
  freeswitchApiClient: { run: runMock },
}))

vi.mock("@chatbotx.io/business/errors", () => ({
  ChatbotXException: class ChatbotXException extends Error {},
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  integrationWhatsappRepository: {
    findByInboxIdForWorkspace: findByInboxIdForWorkspaceMock,
  },
  whatsappCallRepository: { findById: findByIdMock },
}))

vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => key,
}))

const { hangupWhatsappCallAction } = await import(
  "../src/features/integration-whatsapp/calling/actions/hangup-call.action"
)
const action = hangupWhatsappCallAction as unknown as ActionHandler

const call = (workspaceId: string, callId = "call-1") =>
  action({
    bindArgsParsedInputs: [workspaceId],
    parsedInput: { callId },
  })

describe("hangupWhatsappCallAction", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    findByIdMock.mockResolvedValue({
      id: "call-1",
      workspaceId: "workspace-1",
      inboxId: "inbox-1",
      freeswitchUuid: "a-leg-uuid",
      freeswitchBLegUuid: null,
    })
    findByInboxIdForWorkspaceMock.mockResolvedValue({
      id: "integration-1",
      sipNodeId: "default",
    })
  })

  test("denies a cross-workspace call id", async () => {
    await expect(call("workspace-2")).rejects.toThrow(
      "whatsapp.calls.errors.callNotFound",
    )
    expect(runMock).not.toHaveBeenCalled()
  })

  test("kills the A-leg uuid when no B-leg exists yet", async () => {
    await call("workspace-1")
    expect(runMock).toHaveBeenCalledWith("default", {
      kind: "uuidKill",
      uuid: "a-leg-uuid",
    })
  })

  test("prefers the bridged B-leg uuid once one exists", async () => {
    findByIdMock.mockResolvedValue({
      id: "call-1",
      workspaceId: "workspace-1",
      inboxId: "inbox-1",
      freeswitchUuid: "a-leg-uuid",
      freeswitchBLegUuid: "b-leg-uuid",
    })
    await call("workspace-1")
    expect(runMock).toHaveBeenCalledWith("default", {
      kind: "uuidKill",
      uuid: "b-leg-uuid",
    })
  })

  test("no-ops when neither leg has dialed yet", async () => {
    findByIdMock.mockResolvedValue({
      id: "call-1",
      workspaceId: "workspace-1",
      inboxId: "inbox-1",
      freeswitchUuid: null,
      freeswitchBLegUuid: null,
    })
    await call("workspace-1")
    expect(runMock).not.toHaveBeenCalled()
  })
})
