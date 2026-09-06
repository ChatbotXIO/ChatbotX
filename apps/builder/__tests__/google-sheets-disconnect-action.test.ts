// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  auditRecord: vi.fn(),
  disconnect: vi.fn(),
  findByWorkspaceIdOrFail: vi.fn(),
  loggerError: vi.fn(),
  vendorDisconnect: vi.fn(),
}))

vi.mock("@/lib/safe-action", () => {
  const chain: Record<string, unknown> = {}
  chain.bindArgsSchemas = () => chain
  chain.action = (fn: unknown) => fn
  return {
    authActionClient: chain,
  }
})

vi.mock("@/lib/log", () => ({
  logger: { error: mocks.loggerError },
}))

vi.mock("@chatbotx.io/business", () => ({
  integrationGoogleSheetService: {
    disconnect: mocks.disconnect,
    findByWorkspaceIdOrFail: mocks.findByWorkspaceIdOrFail,
  },
}))

vi.mock("@chatbotx.io/business/audit", () => ({
  auditService: { record: mocks.auditRecord },
}))

vi.mock("@chatbotx.io/integration-google-sheets", () => ({
  integration: { disconnect: mocks.vendorDisconnect },
}))

const { disconnectGoogleSheetsAction } = await import(
  "../src/features/integration-google-sheets/actions/disconnect.action"
)

beforeEach(() => {
  vi.clearAllMocks()
  mocks.findByWorkspaceIdOrFail.mockResolvedValue({
    integrationId: "integration-1",
    auth: { accessToken: "token" },
  })
  mocks.disconnect.mockResolvedValue(undefined)
})

describe("disconnectGoogleSheetsAction", () => {
  test("logs a failing vendor disconnect call but still runs the local disconnect", async () => {
    mocks.vendorDisconnect.mockRejectedValue(new Error("vendor down"))

    await (
      disconnectGoogleSheetsAction as (props: unknown) => Promise<unknown>
    )({ bindArgsParsedInputs: ["ws-1"] })

    expect(mocks.loggerError).toHaveBeenCalledWith(
      expect.any(Error),
      "Unable to disconnect google sheets for workspace: ws-1",
    )
    expect(mocks.disconnect).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      integrationId: "integration-1",
    })
    expect(mocks.auditRecord).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      action: "disconnect",
      detail: "disconnected the Google Sheets integration",
    })
  })

  test("runs the local disconnect when the vendor call succeeds", async () => {
    mocks.vendorDisconnect.mockResolvedValue(undefined)

    await (
      disconnectGoogleSheetsAction as (props: unknown) => Promise<unknown>
    )({ bindArgsParsedInputs: ["ws-1"] })

    expect(mocks.loggerError).not.toHaveBeenCalled()
    expect(mocks.disconnect).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      integrationId: "integration-1",
    })
  })
})
