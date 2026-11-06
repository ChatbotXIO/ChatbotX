// @vitest-environment node
import { UnrecoverableError } from "bullmq"
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  claim: vi.fn(),
  run: vi.fn(),
  release: vi.fn(),
  fail: vi.fn(),
  findInstallationByIdOrFail: vi.fn(),
  markInstallationFailed: vi.fn(),
  listQueuedForInstallation: vi.fn(),
  enqueueProcessAIFile: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  templateInstallService: {
    claim: mocks.claim,
    run: mocks.run,
    release: mocks.release,
    fail: mocks.fail,
  },
  templateAiFileDispatchService: {
    listQueuedForInstallation: mocks.listQueuedForInstallation,
  },
  templateService: {
    findInstallationByIdOrFail: mocks.findInstallationByIdOrFail,
    markInstallationFailed: mocks.markInstallationFailed,
  },
}))

vi.mock("@chatbotx.io/worker-config", () => ({
  enqueueProcessAIFile: mocks.enqueueProcessAIFile,
}))

vi.mock("@chatbotx.io/business/errors", () => ({
  ChatbotXException: class ChatbotXException extends Error {
    code: string
    constructor(message: string, code = "systemError") {
      super(message)
      this.code = code
    }
  },
}))

vi.mock("@chatbotx.io/flow-config", () => ({
  parseTemplateExport: vi.fn((payload: unknown) =>
    payload === "invalid"
      ? { ok: false, reason: "bad" }
      : { ok: true, data: payload },
  ),
}))

vi.mock("../src/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))

const { installTemplate, failBlockedTemplateInstall } = await import(
  "../src/default/handlers/install-template"
)
const { ChatbotXException } = await import("@chatbotx.io/business/errors")

const data = { installationId: "install-1", workspaceId: "ws-1" }
const jobOn = (attemptsMade: number, attempts = 2) =>
  ({ attemptsMade, opts: { attempts } }) as never

describe("installTemplate handler", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.claim.mockResolvedValue({ claimToken: "token-1" })
    mocks.findInstallationByIdOrFail.mockResolvedValue({
      installation: { permissions: { allowEdit: true, allowDelete: true } },
      payload: { ok: "payload" },
      templateName: "Shop",
      createInstallFolder: false,
    })
    mocks.run.mockResolvedValue(undefined)
    mocks.listQueuedForInstallation.mockResolvedValue([])
    mocks.enqueueProcessAIFile.mockResolvedValue(undefined)
  })

  test("a redelivery that loses the claim does nothing", async () => {
    mocks.claim.mockResolvedValue(null)

    await installTemplate(data, jobOn(0))

    expect(mocks.findInstallationByIdOrFail).not.toHaveBeenCalled()
    expect(mocks.run).not.toHaveBeenCalled()
  })

  test("runs the install under the claimed lease", async () => {
    await installTemplate(data, jobOn(0))

    expect(mocks.run).toHaveBeenCalledWith(
      expect.objectContaining({
        installationId: "install-1",
        claimToken: "token-1",
        templateName: "Shop",
        permissions: { allowEdit: true, allowDelete: true },
      }),
    )
    expect(mocks.release).not.toHaveBeenCalled()
    expect(mocks.fail).not.toHaveBeenCalled()
  })

  test("queues the embedding jobs of the AI files the install created, after it committed", async () => {
    mocks.listQueuedForInstallation.mockResolvedValue([
      { aiFileId: "f1", runId: "r1" },
      { aiFileId: "f2", runId: "r2" },
    ])

    await installTemplate(data, jobOn(0))

    expect(mocks.listQueuedForInstallation).toHaveBeenCalledWith("install-1")
    expect(mocks.enqueueProcessAIFile).toHaveBeenNthCalledWith(1, {
      aiFileId: "f1",
      runId: "r1",
    })
    expect(mocks.enqueueProcessAIFile).toHaveBeenCalledTimes(2)
    expect(mocks.run.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.enqueueProcessAIFile.mock.invocationCallOrder[0] ?? 0,
    )
  })

  test("a failed AI file enqueue leaves the committed install alone for the sweep", async () => {
    mocks.listQueuedForInstallation.mockResolvedValue([
      { aiFileId: "f1", runId: "r1" },
    ])
    mocks.enqueueProcessAIFile.mockRejectedValue(new Error("redis down"))

    await expect(installTemplate(data, jobOn(0))).resolves.toBeUndefined()

    expect(mocks.release).not.toHaveBeenCalled()
    expect(mocks.fail).not.toHaveBeenCalled()
  })

  test("a failed install queues no AI files", async () => {
    mocks.run.mockRejectedValue(new Error("boom"))

    await expect(installTemplate(data, jobOn(0))).rejects.toThrow()

    expect(mocks.listQueuedForInstallation).not.toHaveBeenCalled()
  })

  test("a transient error before the last attempt releases the claim and rethrows", async () => {
    const error = new Error("connection reset")
    mocks.run.mockRejectedValue(error)

    await expect(installTemplate(data, jobOn(0))).rejects.toBe(error)

    expect(mocks.release).toHaveBeenCalledWith({
      installationId: "install-1",
      claimToken: "token-1",
    })
    expect(mocks.fail).not.toHaveBeenCalled()
  })

  test("a transient error on the final attempt records the failure", async () => {
    const error = new Error("connection reset")
    mocks.run.mockRejectedValue(error)

    await expect(installTemplate(data, jobOn(1))).rejects.toBe(error)

    expect(mocks.fail).toHaveBeenCalledWith(
      expect.objectContaining({
        installationId: "install-1",
        claimToken: "token-1",
        errorCode: "templateInstallFailed",
      }),
    )
    expect(mocks.release).not.toHaveBeenCalled()
  })

  test("a permanent error fails at once and stops BullMQ retrying", async () => {
    mocks.run.mockRejectedValue(
      new ChatbotXException("incompatible", "templatePayloadIncompatible"),
    )

    await expect(installTemplate(data, jobOn(0))).rejects.toBeInstanceOf(
      UnrecoverableError,
    )

    expect(mocks.fail).toHaveBeenCalledWith(
      expect.objectContaining({ errorCode: "templatePayloadIncompatible" }),
    )
    expect(mocks.release).not.toHaveBeenCalled()
  })

  test("an invalid stored payload is a permanent failure", async () => {
    mocks.findInstallationByIdOrFail.mockResolvedValue({
      payload: "invalid",
      templateName: "Shop",
      createInstallFolder: false,
    })

    await expect(installTemplate(data, jobOn(0))).rejects.toBeInstanceOf(
      UnrecoverableError,
    )

    expect(mocks.run).not.toHaveBeenCalled()
    expect(mocks.fail).toHaveBeenCalledWith(
      expect.objectContaining({ errorCode: "templatePayloadIncompatible" }),
    )
  })

  test("a source template deleted before the job ran is permanent", async () => {
    mocks.findInstallationByIdOrFail.mockRejectedValue(
      new ChatbotXException("gone", "templateInstallationSourceMissing"),
    )

    await expect(installTemplate(data, jobOn(0))).rejects.toBeInstanceOf(
      UnrecoverableError,
    )
  })

  test("a blocked owner closes the row instead of leaving it pending", async () => {
    await failBlockedTemplateInstall(data)

    expect(mocks.markInstallationFailed).toHaveBeenCalledWith(
      expect.objectContaining({
        installationId: "install-1",
        errorCode: "workspaceOwnerBlocked",
      }),
    )
  })
})
