// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

// ---------------------------------------------------------------------------
// `connectKlaviyoAction` used to call `integrationKlaviyoService.upsert`
// directly — a second write path to the same `IntegrationKlaviyo`/
// `Connection` rows the Connection engine's `connectFromCredentials` also
// writes, which caused 409 conflicts. It now delegates to
// `connectionService.connectFromCredentials` instead, matching every other
// credential-strategy connect (see `integrations/api/public/ai.ts`).
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  connectFromCredentials: vi.fn(),
  loggerError: vi.fn(),
}))

vi.mock("@/lib/safe-action", () => {
  const chain: Record<string, unknown> = {}
  chain.bindArgsSchemas = () => chain
  chain.inputSchema = () => chain
  chain.action = (fn: unknown) => fn
  return { workspaceActionClient: chain }
})

vi.mock("@/features/common/schema", () => ({
  workspaceIdrequestParams: [],
}))

vi.mock("@/lib/log", () => ({
  logger: { error: mocks.loggerError },
}))

vi.mock("@chatbotx.io/connections", () => ({
  connectionService: { connectFromCredentials: mocks.connectFromCredentials },
}))

// Dynamic import is required here (not a static-import violation): the
// action module must load *after* the vi.mock registrations above are in
// place, so its `connectionService`/`logger` imports resolve to the test
// doubles instead of the real implementations.
const { connectKlaviyoAction } = await import("../connect.action")

type ActionHandler = (props: {
  parsedInput: { apiKey: string }
  bindArgsParsedInputs: [string]
}) => Promise<unknown>

const call = connectKlaviyoAction as unknown as ActionHandler
const workspaceId = "workspace-1"

beforeEach(() => {
  vi.clearAllMocks()
})

describe("connectKlaviyoAction", () => {
  test("delegates to connectFromCredentials with allowUpdate: true (upsert semantics)", async () => {
    mocks.connectFromCredentials.mockResolvedValue(undefined)

    await call({
      parsedInput: { apiKey: "secret-key" },
      bindArgsParsedInputs: [workspaceId],
    })

    expect(mocks.connectFromCredentials).toHaveBeenCalledWith({
      workspaceId,
      provider: "klaviyo",
      config: { apiKey: "secret-key" },
      allowUpdate: true,
    })
  })

  test("logs and rethrows when connectFromCredentials rejects", async () => {
    const error = new Error("credentials rejected")
    mocks.connectFromCredentials.mockRejectedValue(error)

    await expect(
      call({
        parsedInput: { apiKey: "bad-key" },
        bindArgsParsedInputs: [workspaceId],
      }),
    ).rejects.toThrow("credentials rejected")

    expect(mocks.loggerError).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId }),
      "Failed to connect Klaviyo",
    )
  })
})
