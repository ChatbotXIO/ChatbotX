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

const { threadsCredentialUpdateSchema } = await import(
  "@chatbotx.io/database/partials"
)
const { deleteThreadsSettingsAction } = await import(
  "../src/features/platform-credentials/threads/delete-threads-settings.action"
)
const { updateThreadsSettingAction } = await import(
  "../src/features/platform-credentials/threads/update-threads-settings.action"
)

const call = (action: unknown) => action as (args: any) => Promise<unknown>

describe("Threads credential actions", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resolveSpy.mockReturnValue("user-1")
  })

  test("upserts all threads credential fields", async () => {
    await call(updateThreadsSettingAction)({
      ctx: { user: { id: "user-1" } },
      bindArgsParsedInputs: ["user"],
      parsedInput: {
        clientId: "id",
        version: "v1.0",
        verifyToken: "verify",
        clientSecret: "secret",
      },
    })

    expect(upsertSpy).toHaveBeenCalledWith({
      userId: "user-1",
      type: "threads",
      config: {
        clientId: "id",
        version: "v1.0",
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
      threadsCredentialUpdateSchema.safeParse({
        clientId: "id",
        version: "v1.0",
        verifyToken: "verify",
        clientSecret: "secret",
        [field]: "",
      }).success,
    ).toBe(false)
  })

  test("deletes user and platform scoped threads credentials", async () => {
    await call(deleteThreadsSettingsAction)({
      ctx: { user: { id: "u" } },
      bindArgsParsedInputs: ["user"],
    })

    expect(removeSpy).toHaveBeenCalledWith({
      userId: "user-1",
      type: "threads",
    })

    resolveSpy.mockReturnValue(undefined)
    await call(deleteThreadsSettingsAction)({
      ctx: { user: { id: "a" } },
      bindArgsParsedInputs: ["platform"],
    })

    expect(removeSpy).toHaveBeenCalledWith({
      userId: undefined,
      type: "threads",
    })
  })
})
