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
const { zaloCredentialUpdateSchema } = await import(
  "@chatbotx.io/database/partials"
)
const { deleteZaloSettingsAction } = await import(
  "../src/features/platform-credentials/zalo/delete-zalo-settings.action"
)
const { updateZaloSettingsAction } = await import(
  "../src/features/platform-credentials/zalo/update-zalo-settings.action"
)
const call = (action: unknown) => action as (args: any) => Promise<unknown>
describe("Zalo credential actions", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resolveSpy.mockReturnValue("user-1")
  })
  test("upserts all fields", async () => {
    await call(updateZaloSettingsAction)({
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
      type: "zalo",
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
      zaloCredentialUpdateSchema.safeParse({
        clientId: "id",
        version: "v1",
        verifyToken: "verify",
        clientSecret: "secret",
        [field]: "",
      }).success,
    ).toBe(false)
  })
  test("deletes user and platform credentials", async () => {
    await call(deleteZaloSettingsAction)({
      ctx: { user: { id: "u" } },
      bindArgsParsedInputs: ["user"],
    })
    expect(removeSpy).toHaveBeenCalledWith({ userId: "user-1", type: "zalo" })
    resolveSpy.mockReturnValue(undefined)
    await call(deleteZaloSettingsAction)({
      ctx: { user: { id: "a" } },
      bindArgsParsedInputs: ["platform"],
    })
    expect(removeSpy).toHaveBeenCalledWith({ userId: undefined, type: "zalo" })
  })
})
