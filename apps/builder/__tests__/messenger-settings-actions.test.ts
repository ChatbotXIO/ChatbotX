// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

const { removeSpy, resolveSpy, upsertSpy } = vi.hoisted(() => ({
  removeSpy: vi.fn(),
  resolveSpy: vi.fn(),
  upsertSpy: vi.fn(),
}))
vi.mock("@/lib/safe-action", () => {
  const chain: Record<string, any> = {}
  chain.bindArgsSchemas = () => chain
  chain.inputSchema = () => chain
  chain.action = (handler: unknown) => handler
  return { authActionClient: chain }
})
vi.mock("@chatbotx.io/business", () => ({
  platformCredentialService: { remove: removeSpy, upsert: upsertSpy },
}))
vi.mock("../src/features/platform-credentials/scope", () => ({
  credentialScopeSchema: {},
  resolveCredentialScopedUserId: resolveSpy,
}))
const { messengerCredentialUpdateSchema } = await import(
  "@chatbotx.io/database/partials"
)
const { deleteMessengerSettingsAction } = await import(
  "../src/features/platform-credentials/messenger/delete-messenger-settings.action"
)
const { updateMessengerSettingAction } = await import(
  "../src/features/platform-credentials/messenger/update-messenger-settings.action"
)
const call = (action: unknown) => action as (args: any) => Promise<unknown>
describe("Messenger credential actions", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resolveSpy.mockReturnValue("user-1")
  })
  test("upserts all fields", async () => {
    await call(updateMessengerSettingAction)({
      ctx: { user: { id: "user-1" } },
      bindArgsParsedInputs: ["user"],
      parsedInput: {
        clientId: "id",
        version: "v1",
        verifyToken: "verify",
        clientSecret: "secret",
      },
    })
    expect(upsertSpy).toHaveBeenCalledWith({
      userId: "user-1",
      type: "messenger",
      config: {
        clientId: "id",
        version: "v1",
        verifyToken: "verify",
        clientSecret: "secret",
      },
    })
  })
  test.each([
    "clientId",
    "version",
    "verifyToken",
    "clientSecret",
  ])("rejects empty %s", (field) => {
    expect(
      messengerCredentialUpdateSchema.safeParse({
        clientId: "id",
        version: "v1",
        verifyToken: "verify",
        clientSecret: "secret",
        [field]: "",
      }).success,
    ).toBe(false)
  })
  test("deletes user and platform credentials", async () => {
    await call(deleteMessengerSettingsAction)({
      ctx: { user: { id: "u" } },
      bindArgsParsedInputs: ["user"],
    })
    expect(removeSpy).toHaveBeenCalledWith({
      userId: "user-1",
      type: "messenger",
    })
    resolveSpy.mockReturnValue(undefined)
    await call(deleteMessengerSettingsAction)({
      ctx: { user: { id: "a" } },
      bindArgsParsedInputs: ["platform"],
    })
    expect(removeSpy).toHaveBeenCalledWith({
      userId: undefined,
      type: "messenger",
    })
  })
})
