// @vitest-environment node
import { UnrecoverableError } from "bullmq"
import { beforeEach, describe, expect, test, vi } from "vitest"

vi.mock("../src/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))

const { runLeasedTemplateJob } = await import(
  "../src/lib/run-leased-template-job"
)
const { ChatbotXException } = await import("@chatbotx.io/business/errors")

const jobOn = (attemptsMade: number, attempts = 3) =>
  ({ attemptsMade, opts: { attempts } }) as never

const release = vi.fn()
const fail = vi.fn()
const base = (run: () => Promise<void>, attemptsMade = 0) => ({
  job: jobOn(attemptsMade),
  failureMessage: "Template job failed",
  logContext: { id: "1" },
  unknownErrorCode: "templateJobFailed",
  run,
  release,
  fail,
})

beforeEach(() => {
  vi.clearAllMocks()
})

describe("runLeasedTemplateJob", () => {
  test("resolves quietly when the work succeeds", async () => {
    await runLeasedTemplateJob(base(() => Promise.resolve()))
    expect(release).not.toHaveBeenCalled()
    expect(fail).not.toHaveBeenCalled()
  })

  test.each([
    "templateInstallLeaseLost",
    "templateSyncLeaseLost",
    "templateUninstallLeaseLost",
  ])("a lost lease (%s) is dropped: the winner owns the row", async (code) => {
    await expect(
      runLeasedTemplateJob(
        base(() => Promise.reject(new ChatbotXException("lost", code))),
      ),
    ).resolves.toBeUndefined()
    expect(release).not.toHaveBeenCalled()
    expect(fail).not.toHaveBeenCalled()
  })

  test.each([
    "templatePayloadIncompatible",
    "templateUninstallNotGranted",
    "templateUninstallNoHandler",
  ])("a permanent failure (%s) closes the row and is never retried", async (code) => {
    const error = new ChatbotXException("no", code)
    await expect(
      runLeasedTemplateJob(base(() => Promise.reject(error))),
    ).rejects.toBeInstanceOf(UnrecoverableError)
    expect(fail).toHaveBeenCalledWith(code, error)
    expect(release).not.toHaveBeenCalled()
  })

  test("a transient failure releases the lease and is rethrown for the retry", async () => {
    await expect(
      runLeasedTemplateJob(base(() => Promise.reject(new Error("blip")))),
    ).rejects.toThrow("blip")
    expect(release).toHaveBeenCalledTimes(1)
    expect(fail).not.toHaveBeenCalled()
  })

  test("the final attempt closes the row with the fallback code", async () => {
    await expect(
      runLeasedTemplateJob(base(() => Promise.reject(new Error("blip")), 2)),
    ).rejects.toThrow("blip")
    expect(fail).toHaveBeenCalledWith("templateJobFailed", expect.any(Error))
    expect(release).not.toHaveBeenCalled()
  })

  test("the dead dependency-conflict code is no longer special: it is transient", async () => {
    await expect(
      runLeasedTemplateJob(
        base(() =>
          Promise.reject(
            new ChatbotXException("x", "templateUninstallDependencyConflict"),
          ),
        ),
      ),
    ).rejects.toThrow("x")
    expect(release).toHaveBeenCalledTimes(1)
  })
})
