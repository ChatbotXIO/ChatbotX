// @vitest-environment node
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  updatePixRedirectEnabled: vi.fn(),
  assertWorkspaceSuperAdmin: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  integrationWhatsappService: {
    updatePixRedirectEnabled: mocks.updatePixRedirectEnabled,
  },
}))

vi.mock("@/lib/auth/assert-workspace-super-admin", () => ({
  assertWorkspaceSuperAdmin: mocks.assertWorkspaceSuperAdmin,
}))

vi.mock("@/lib/safe-action", () => ({
  workspaceActionClient: {
    bindArgsSchemas: () => ({
      inputSchema: () => ({ action: (fn: unknown) => fn }),
    }),
  },
}))

const { updatePixRedirectAction: untypedAction } = await import(
  "../src/features/integration-whatsapp/payment/actions/update-pix-redirect.action"
)
const updatePixRedirectAction = untypedAction as unknown as (props: {
  bindArgsParsedInputs: [string, string]
  parsedInput: { pixRedirectEnabled: boolean }
}) => Promise<unknown>

const run = (pixRedirectEnabled: boolean) =>
  updatePixRedirectAction({
    bindArgsParsedInputs: ["ws-1", "wa-1"],
    parsedInput: { pixRedirectEnabled },
  })

beforeEach(() => {
  vi.clearAllMocks()
  mocks.assertWorkspaceSuperAdmin.mockResolvedValue(undefined)
  mocks.updatePixRedirectEnabled.mockResolvedValue(undefined)
})

describe("updatePixRedirectAction", () => {
  test.each([
    true,
    false,
  ])("saves %s for the bound workspace and number", async (enabled) => {
    await expect(run(enabled)).resolves.toEqual({
      pixRedirectEnabled: enabled,
    })
    expect(mocks.assertWorkspaceSuperAdmin).toHaveBeenCalledWith("ws-1")
    expect(mocks.updatePixRedirectEnabled).toHaveBeenCalledWith({
      id: "wa-1",
      workspaceId: "ws-1",
      enabled,
    })
  })

  test("refuses a non super admin before any write", async () => {
    mocks.assertWorkspaceSuperAdmin.mockRejectedValue(
      new ChatbotXException("errors.superAdminRequired"),
    )

    await expect(run(true)).rejects.toThrow("errors.superAdminRequired")
    expect(mocks.updatePixRedirectEnabled).not.toHaveBeenCalled()
  })

  test("a number outside the workspace surfaces the not-found error", async () => {
    mocks.updatePixRedirectEnabled.mockRejectedValue(
      new ChatbotXException("WhatsApp integration not found", "notFound", 404),
    )

    await expect(run(true)).rejects.toThrow("WhatsApp integration not found")
  })
})
