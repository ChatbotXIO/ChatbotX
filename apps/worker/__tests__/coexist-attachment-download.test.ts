import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  ensureAttachmentMirrored: vi.fn(),
  loggerError: vi.fn(),
  loggerWarn: vi.fn(),
  markAttachmentUnresolvable: vi.fn(),
}))

class MockTerminalMediaError extends Error {}

vi.mock("@chatbotx.io/channel-registry/media-hydration", () => ({
  AttachmentTooLargeError: class AttachmentTooLargeError extends Error {},
  downloadBearerUrlMedia: vi.fn(),
  downloadWhatsappMedia: vi.fn(),
  ensureAttachmentMirrored: mocks.ensureAttachmentMirrored,
  markAttachmentUnresolvable: mocks.markAttachmentUnresolvable,
  MAX_ATTACHMENT_BYTES: 100 * 1024 * 1024,
  readBodyWithCap: vi.fn(),
  TerminalMediaError: MockTerminalMediaError,
}))

vi.mock("../src/lib/logger", () => ({
  logger: {
    error: mocks.loggerError,
    warn: mocks.loggerWarn,
  },
}))

const { coexistAttachmentDownload, markUnresolvableOnFinalAttempt } =
  await import("../src/integration/handlers/coexist/attachment-download")

const data = {
  attachmentId: "attachment-1",
  workspaceId: "workspace-1",
  channel: "whatsapp" as const,
  integrationId: "integration-1",
}

const job = (attemptsMade = 0, attempts = 5) =>
  ({
    attemptsMade,
    opts: { attempts },
    data: {
      type: "coexistAttachmentDownload" as const,
      data,
    },
  }) as never

describe("coexistAttachmentDownload", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.ensureAttachmentMirrored.mockResolvedValue({
      originPath: "workspace/workspace-1/media.jpg",
    })
    mocks.markAttachmentUnresolvable.mockResolvedValue(undefined)
  })

  test("delegates the existing job payload to shared hydration", async () => {
    await coexistAttachmentDownload(job(), data)

    expect(mocks.ensureAttachmentMirrored).toHaveBeenCalledWith({
      attachmentId: data.attachmentId,
      workspaceId: data.workspaceId,
    })
  })

  test("terminates permanent media failures without retrying", async () => {
    mocks.ensureAttachmentMirrored.mockRejectedValue(
      new MockTerminalMediaError("too large"),
    )

    await expect(
      coexistAttachmentDownload(job(), data),
    ).resolves.toBeUndefined()

    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({ attachmentId: data.attachmentId }),
      expect.stringContaining("terminal media failure"),
    )
    expect(mocks.loggerError).not.toHaveBeenCalled()
    expect(mocks.markAttachmentUnresolvable).not.toHaveBeenCalled()
  })

  test("rethrows transient hydration failures before the final attempt", async () => {
    const err = new Error("storage unavailable")
    mocks.ensureAttachmentMirrored.mockRejectedValue(err)

    await expect(coexistAttachmentDownload(job(2, 5), data)).rejects.toBe(err)

    expect(mocks.loggerError).toHaveBeenCalledWith(
      expect.objectContaining({ err, attachmentId: data.attachmentId }),
      expect.stringContaining("hydration failed"),
    )
    expect(mocks.markAttachmentUnresolvable).not.toHaveBeenCalled()
  })

  test("marks a retryable failure unresolvable on the final attempt", async () => {
    const err = new Error("Graph returned fewer attachments")
    mocks.ensureAttachmentMirrored.mockRejectedValue(err)

    await expect(coexistAttachmentDownload(job(4, 5), data)).rejects.toBe(err)

    expect(mocks.markAttachmentUnresolvable).toHaveBeenCalledWith({
      attachmentId: data.attachmentId,
      workspaceId: data.workspaceId,
    })
  })

  test("preserves and logs the hydration error when final marking fails", async () => {
    const hydrationError = new Error("Graph returned fewer attachments")
    const markingError = new Error("database unavailable")
    mocks.ensureAttachmentMirrored.mockRejectedValue(hydrationError)
    mocks.markAttachmentUnresolvable.mockRejectedValue(markingError)

    await expect(coexistAttachmentDownload(job(4, 5), data)).rejects.toBe(
      hydrationError,
    )

    expect(mocks.loggerError).toHaveBeenCalledWith(
      expect.objectContaining({
        err: markingError,
        attachmentId: data.attachmentId,
      }),
      expect.stringContaining("mark unresolvable"),
    )
    expect(mocks.loggerError).toHaveBeenCalledWith(
      expect.objectContaining({
        err: hydrationError,
        attachmentId: data.attachmentId,
      }),
      expect.stringContaining("hydration failed"),
    )
  })

  test("the final-attempt helper uses BullMQ attempt arithmetic", async () => {
    await markUnresolvableOnFinalAttempt(job(1, 3), data)
    expect(mocks.markAttachmentUnresolvable).not.toHaveBeenCalled()

    await markUnresolvableOnFinalAttempt(job(2, 3), data)
    expect(mocks.markAttachmentUnresolvable).toHaveBeenCalledTimes(1)
  })
})
