import { SdkException } from "@chatbotx.io/sdk"
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  disable: vi.fn(),
  enable: vi.fn(),
  findIntegrationForCoexist: vi.fn(),
  loggerError: vi.fn(),
  markFailed: vi.fn(),
  transaction: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: { transaction: mocks.transaction },
  isUniqueViolationError: vi.fn().mockReturnValue(false),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  integrationWhatsappRepository: {},
}))

vi.mock("../src/coexist/service", () => ({
  coexistService: {
    disable: mocks.disable,
    enable: mocks.enable,
    findIntegrationForCoexist: mocks.findIntegrationForCoexist,
    markFailed: mocks.markFailed,
  },
}))

vi.mock("../src/logger", () => ({
  logger: { error: mocks.loggerError, warn: vi.fn() },
}))

const { integrationWhatsappService } = await import(
  "../src/integration-whatsapp/service"
)

const validAuth = {
  version: "v23.0",
  tokens: { accessToken: "access-token-1" },
  metadata: { wabaId: "waba-1" },
}

describe("integrationWhatsappService.setCoexist", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.findIntegrationForCoexist.mockResolvedValue({
      id: "integration-1",
      channel: "whatsapp",
      phoneNumberId: "pn-1",
      auth: validAuth,
    })
    mocks.enable.mockResolvedValue({ success: true, runId: "run-1" })
    mocks.disable.mockResolvedValue({ success: true })
  })

  test("flips the flag, creates a run, and triggers state then history in order", async () => {
    const calls: string[] = []
    const triggerSync = vi.fn(({ syncType }: { syncType: string }) => {
      calls.push(syncType)
      return Promise.resolve({ ok: true })
    })

    await expect(
      integrationWhatsappService.setCoexist({
        workspaceId: "workspace-1",
        integrationId: "integration-1",
        enabled: true,
        triggerSync,
      }),
    ).resolves.toEqual({ success: true })

    expect(mocks.enable).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      integrationId: "integration-1",
      channel: "whatsapp",
      triggerSource: "popup-enable",
      aiReadsSyncedHistory: false,
    })
    expect(triggerSync).toHaveBeenCalledTimes(2)
    expect(calls).toEqual(["smb_app_state_sync", "history"])
    expect(triggerSync).toHaveBeenNthCalledWith(1, {
      accessToken: "access-token-1",
      version: "v23.0",
      phoneNumberId: "pn-1",
      syncType: "smb_app_state_sync",
    })
  })

  test("writes aiReadsSyncedHistory only on enable", async () => {
    const triggerSync = vi.fn().mockResolvedValue({ ok: true })

    await integrationWhatsappService.setCoexist({
      workspaceId: "workspace-1",
      integrationId: "integration-1",
      enabled: true,
      aiReadsSyncedHistory: true,
      triggerSync,
    })

    expect(mocks.enable).toHaveBeenCalledWith(
      expect.objectContaining({ aiReadsSyncedHistory: true }),
    )
  })

  // A decline goes through the SHARED disable path, which also
  // tears down every live run (`init | running | waiting`). Before this it only
  // flipped the flag, so a WhatsApp run parked in `waiting` outlived the
  // feature and the recovery pass kept reviving it into "Max scheduler retries
  // exceeded".
  test("decline (enabled: false) delegates to coexistService.disable and never triggers", async () => {
    const triggerSync = vi.fn()

    await expect(
      integrationWhatsappService.setCoexist({
        workspaceId: "workspace-1",
        integrationId: "integration-1",
        enabled: false,
        triggerSync,
      }),
    ).resolves.toEqual({ success: true })

    expect(mocks.disable).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      integrationId: "integration-1",
      channel: "whatsapp",
    })
    expect(mocks.enable).not.toHaveBeenCalled()
    expect(triggerSync).not.toHaveBeenCalled()
  })

  test("decline returns notFound when the integration is not in this workspace", async () => {
    mocks.disable.mockResolvedValueOnce({
      success: false,
      reason: "not_found",
    })

    await expect(
      integrationWhatsappService.setCoexist({
        workspaceId: "workspace-1",
        integrationId: "missing",
        enabled: false,
        triggerSync: vi.fn(),
      }),
    ).resolves.toEqual({ success: false, cause: "notFound" })
  })

  // Enable reuses a live run instead of opening a second
  // one — the run id every later write targets comes from `coexistService`.
  test("enable reuses the live run coexistService.enable returns", async () => {
    mocks.enable.mockResolvedValueOnce({
      success: true,
      runId: "run-waiting",
    })
    const triggerSync = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, reason: "window_expired" })

    await integrationWhatsappService.setCoexist({
      workspaceId: "workspace-1",
      integrationId: "integration-1",
      enabled: true,
      triggerSync,
    })

    expect(mocks.markFailed).toHaveBeenCalledWith({
      runId: "run-waiting",
      currentError: "smb_app_data window_expired",
    })
  })

  test("a { ok: false } trigger result surfaces the reason and marks the run failed", async () => {
    const triggerSync = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, reason: "window_expired" })

    await expect(
      integrationWhatsappService.setCoexist({
        workspaceId: "workspace-1",
        integrationId: "integration-1",
        enabled: true,
        triggerSync,
      }),
    ).resolves.toEqual({
      success: false,
      cause: "triggerRejected",
      reason: "window_expired",
    })

    expect(mocks.markFailed).toHaveBeenCalledWith({
      runId: "run-1",
      currentError: "smb_app_data window_expired",
    })
    expect(triggerSync).toHaveBeenCalledTimes(1)
  })

  test("a { ok: false } trigger result with no reason marks nothing and returns bare success:false", async () => {
    const triggerSync = vi.fn().mockResolvedValueOnce({ ok: false })

    await expect(
      integrationWhatsappService.setCoexist({
        workspaceId: "workspace-1",
        integrationId: "integration-1",
        enabled: true,
        triggerSync,
      }),
    ).resolves.toEqual({ success: false, cause: "triggerRejected" })

    // Never writes "smb_app_data undefined" — the run is left untouched.
    expect(mocks.markFailed).not.toHaveBeenCalled()
  })

  test("a thrown SdkException logs the failure, marks trigger_failed with msg, and the exception message as currentError", async () => {
    const error = new SdkException("Meta rejected the sync")
    const triggerSync = vi.fn().mockRejectedValueOnce(error)

    await expect(
      integrationWhatsappService.setCoexist({
        workspaceId: "workspace-1",
        integrationId: "integration-1",
        enabled: true,
        triggerSync,
      }),
    ).resolves.toEqual({
      success: false,
      cause: "triggerThrew",
      reason: "trigger_failed",
      msg: "Meta rejected the sync",
    })

    expect(mocks.markFailed).toHaveBeenCalledWith({
      runId: "run-1",
      currentError: "Meta rejected the sync",
    })
    expect(mocks.loggerError).toHaveBeenCalledWith(
      expect.objectContaining({
        err: error,
        integrationId: "integration-1",
      }),
      "smb_app_data trigger failed",
    )
  })

  test("a thrown non-Error logs the failure, marks trigger_failed with no msg, and a generic currentError", async () => {
    const triggerSync = vi.fn().mockRejectedValueOnce("stringy failure")

    await expect(
      integrationWhatsappService.setCoexist({
        workspaceId: "workspace-1",
        integrationId: "integration-1",
        enabled: true,
        triggerSync,
      }),
    ).resolves.toEqual({
      success: false,
      cause: "triggerThrew",
      reason: "trigger_failed",
      msg: undefined,
    })

    expect(mocks.markFailed).toHaveBeenCalledWith({
      runId: "run-1",
      currentError: "smb_app_data error",
    })
    expect(mocks.loggerError).toHaveBeenCalledWith(
      expect.objectContaining({
        err: "stringy failure",
        integrationId: "integration-1",
      }),
      "smb_app_data trigger failed",
    )
  })

  test("returns success:false when the integration is not found for the workspace", async () => {
    mocks.findIntegrationForCoexist.mockResolvedValueOnce(null)
    const triggerSync = vi.fn()

    await expect(
      integrationWhatsappService.setCoexist({
        workspaceId: "workspace-1",
        integrationId: "missing",
        enabled: true,
        triggerSync,
      }),
    ).resolves.toEqual({ success: false, cause: "notFound" })

    expect(mocks.enable).not.toHaveBeenCalled()
    expect(triggerSync).not.toHaveBeenCalled()
  })

  test("scopes both the lookup and the flag update by workspaceId and integrationId", async () => {
    const triggerSync = vi.fn().mockResolvedValue({ ok: true })

    await integrationWhatsappService.setCoexist({
      workspaceId: "workspace-42",
      integrationId: "integration-7",
      enabled: true,
      triggerSync,
    })

    expect(mocks.findIntegrationForCoexist).toHaveBeenCalledWith({
      workspaceId: "workspace-42",
      integrationId: "integration-7",
      channel: "whatsapp",
    })
    expect(mocks.enable).toHaveBeenCalledWith(
      expect.objectContaining({
        integrationId: "integration-7",
        workspaceId: "workspace-42",
      }),
    )
  })

  test("unparsable auth returns success:false without triggering or creating a run", async () => {
    mocks.findIntegrationForCoexist.mockResolvedValueOnce({
      id: "integration-1",
      channel: "whatsapp",
      phoneNumberId: "pn-1",
      auth: { not: "the expected shape" },
    })
    const triggerSync = vi.fn()

    await expect(
      integrationWhatsappService.setCoexist({
        workspaceId: "workspace-1",
        integrationId: "integration-1",
        enabled: true,
        triggerSync,
      }),
    ).resolves.toEqual({ success: false, cause: "invalidAuth" })

    // Validated BEFORE the enable write: a run whose token we cannot read
    // would be picked up by the scheduler forever.
    expect(mocks.enable).not.toHaveBeenCalled()
    expect(triggerSync).not.toHaveBeenCalled()
  })
})
