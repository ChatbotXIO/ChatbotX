// @vitest-environment node
import { UnrecoverableError } from "bullmq"
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  claim: vi.fn(),
  run: vi.fn(),
  release: vi.fn(),
  fail: vi.fn(),
  skipBlocked: vi.fn(),
}))

vi.mock("@chatbotx.io/business/template-uninstall/execute", () => ({
  templateUninstallExecuteService: {
    claim: mocks.claim,
    run: mocks.run,
    release: mocks.release,
    fail: mocks.fail,
    skipBlocked: mocks.skipBlocked,
  },
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
vi.mock("../src/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))

const { ChatbotXException } = await import("@chatbotx.io/business/errors")
const { uninstallTemplate, skipBlockedTemplateUninstall } = await import(
  "../src/default/handlers/uninstall-template"
)

const data = { installationId: "inst-1", workspaceId: "ws-1", attempt: 1 }
const jobOn = (attemptsMade: number, attempts = 3) =>
  ({ attemptsMade, opts: { attempts } }) as never
const claim = { claimToken: "claim-1" }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.claim.mockResolvedValue(claim)
  mocks.run.mockResolvedValue(undefined)
})

describe("uninstallTemplate", () => {
  test("is a no-op when the row is already claimed or finished", async () => {
    mocks.claim.mockResolvedValue(null)

    await uninstallTemplate(data, jobOn(0))

    expect(mocks.run).not.toHaveBeenCalled()
  })

  test("runs the claimed uninstall with the workspace attached", async () => {
    await uninstallTemplate(data, jobOn(0))

    expect(mocks.run).toHaveBeenCalledWith({
      ...claim,
      workspaceId: "ws-1",
    })
  })

  test("a lost claim is dropped without failing or releasing the row", async () => {
    mocks.run.mockRejectedValue(
      new ChatbotXException("lost", "templateUninstallLeaseLost"),
    )

    await expect(uninstallTemplate(data, jobOn(0))).resolves.toBeUndefined()

    expect(mocks.fail).not.toHaveBeenCalled()
    expect(mocks.release).not.toHaveBeenCalled()
  })

  test("a permanent failure fails the row and is not retried", async () => {
    mocks.run.mockRejectedValue(
      new ChatbotXException("no", "templateUninstallNotGranted"),
    )

    await expect(uninstallTemplate(data, jobOn(0))).rejects.toBeInstanceOf(
      UnrecoverableError,
    )

    expect(mocks.fail).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "ws-1" }),
      "templateUninstallNotGranted",
    )
  })

  test("a transient failure releases the claim for a retry, and fails the row on the last attempt", async () => {
    mocks.run.mockRejectedValue(new Error("db blip"))

    await expect(uninstallTemplate(data, jobOn(0))).rejects.toThrow("db blip")
    expect(mocks.release).toHaveBeenCalledTimes(1)
    expect(mocks.fail).not.toHaveBeenCalled()

    await expect(uninstallTemplate(data, jobOn(2))).rejects.toThrow("db blip")
    expect(mocks.fail).toHaveBeenCalledWith(
      expect.anything(),
      "templateUninstallFailed",
    )
  })
})

describe("skipBlockedTemplateUninstall", () => {
  test("a blocked owner closes the row as skipped instead of leaving it pending for the sweep", async () => {
    await skipBlockedTemplateUninstall(data)

    expect(mocks.skipBlocked).toHaveBeenCalledWith("inst-1")
    // It never claims or runs the uninstall, so nothing is deleted and nothing retries.
    expect(mocks.claim).not.toHaveBeenCalled()
    expect(mocks.run).not.toHaveBeenCalled()
  })
})
