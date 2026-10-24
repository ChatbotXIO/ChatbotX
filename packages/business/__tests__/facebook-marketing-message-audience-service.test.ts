import { beforeEach, describe, expect, test, vi } from "vitest"

const repository = {
  listByWorkspaceId: vi.fn(),
  findForWorkspace: vi.fn(),
  create: vi.fn(),
  incrementRowsUploaded: vi.fn(),
  markReady: vi.fn(),
  remove: vi.fn(),
}
const messageRepository = { countByAudienceId: vi.fn() }
vi.mock("@chatbotx.io/database/repositories", () => ({
  facebookMarketingMessageAudienceRepository: repository,
  facebookMarketingMessageRepository: messageRepository,
}))
vi.mock("../src/audit/dispatcher", () => ({ dispatchAuditRecord: vi.fn() }))

class AudienceUploadError extends Error {
  readonly received: number
  readonly invalid: number
  constructor(received: number, invalid: number) {
    super("upload failed")
    this.received = received
    this.invalid = invalid
  }
}
class FacebookAdsException extends Error {
  code: string | number
  constructor(message: string, code: string | number = "facebookAdsError") {
    super(message)
    this.code = code
  }
}
const graph = {
  FacebookAdsException,
  createMarketingMessagesAudience: vi.fn(),
  uploadAudienceUsersSession: vi.fn(),
  deleteCustomAudience: vi.fn(),
  getMarketingMessagesAudiences: vi.fn(),
  getNotificationMessageTokenAudienceIds: vi.fn(),
  AudienceUploadError,
}
vi.mock("@chatbotx.io/integration-facebook-ads", () => graph)

const { facebookMarketingMessageAudienceService: service } = await import(
  "../src/facebook-marketing-message-audience/service"
)

const grant = { accessToken: "T", version: "v25.0", facebookUserId: "asuid" }
const csv = (text: string) => ({
  fileName: "list.csv",
  buffer: Buffer.from(text, "utf8"),
})
const createInput = (text: string) => ({
  workspaceId: "w1",
  grant,
  adAccountId: "act_9",
  pageId: "page_1",
  name: "VIP",
  description: null,
  file: csv(text),
})

beforeEach(() => {
  vi.clearAllMocks()
  graph.createMarketingMessagesAudience.mockResolvedValue({ id: "aud_1" })
  graph.uploadAudienceUsersSession.mockResolvedValue({
    received: 2,
    invalid: 0,
  })
  repository.create.mockResolvedValue({
    id: "row_1",
    customAudienceId: "aud_1",
  })
})

describe("create", () => {
  test("a Graph rejection of the create becomes audienceCreateRejected with Meta's message, no row, no upload", async () => {
    graph.createMarketingMessagesAudience.mockRejectedValue(
      new FacebookAdsException("(#100) Invalid parameter", 100),
    )
    await expect(
      service.create(createInput("email\na@b.co\n")),
    ).rejects.toMatchObject({
      code: "audienceCreateRejected",
      data: { reason: "(#100) Invalid parameter" },
    })
    expect(repository.create).not.toHaveBeenCalled()
    expect(graph.uploadAudienceUsersSession).not.toHaveBeenCalled()
  })

  test("a timeout / network error (no Graph code) stays a thrown error", async () => {
    const timeout = new FacebookAdsException("timed out")
    graph.createMarketingMessagesAudience.mockRejectedValue(timeout)
    await expect(service.create(createInput("email\na@b.co\n"))).rejects.toBe(
      timeout,
    )
  })

  test("validates, creates on Meta, inserts, uploads, and counts", async () => {
    const result = await service.create(
      createInput("email,phone\na@b.co,\n,\nc@d.co,+44 303 123 7300\n"),
    )
    expect(result).toEqual({
      id: "row_1",
      customAudienceId: "aud_1",
      received: 2,
      skipped: 0,
      invalid: 0,
    })
    expect(graph.createMarketingMessagesAudience).toHaveBeenCalledWith({
      accessToken: "T",
      adAccountId: "act_9",
      pageId: "page_1",
      name: "VIP",
      description: null,
      version: "v25.0",
    })
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "w1",
        customAudienceId: "aud_1",
        facebookUserId: "asuid",
      }),
    )
    const upload = graph.uploadAudienceUsersSession.mock.calls[0]?.[0]
    expect(upload.schema).toEqual(["EMAIL", "PHONE"])
    expect(upload.data).toHaveLength(2)
    expect(repository.incrementRowsUploaded).toHaveBeenCalledWith({
      id: "row_1",
      workspaceId: "w1",
      by: 2,
    })
  })

  test("reports skipped rows", async () => {
    const result = await service.create(createInput("email\na@b.co\nnope\n"))
    expect(result.skipped).toBe(1)
  })

  test.each([
    ["no email/phone column", "fn,ln\nA,B\n", "audienceNoIdentifier"],
    ["no valid rows", "email\nnope\n", "audienceNoValidRows"],
    ["empty file", "", "audienceInvalidFile"],
  ])("%s → %s, nothing created on Meta", async (_label, text, code) => {
    await expect(service.create(createInput(text))).rejects.toMatchObject({
      code,
    })
    expect(graph.createMarketingMessagesAudience).not.toHaveBeenCalled()
    expect(repository.create).not.toHaveBeenCalled()
  })

  test("unsupported extension → audienceInvalidFile", async () => {
    await expect(
      service.create({
        ...createInput("email\na@b.co\n"),
        file: { fileName: "list.xls", buffer: Buffer.from("x") },
      }),
    ).rejects.toMatchObject({ code: "audienceInvalidFile" })
  })

  test("partial upload keeps the row, persists the count, and reports it", async () => {
    graph.uploadAudienceUsersSession.mockRejectedValue(
      new AudienceUploadError(10_000, 3),
    )
    await expect(
      service.create(createInput("email\na@b.co\n")),
    ).rejects.toMatchObject({
      code: "audiencePartialUpload",
      data: { received: 10_000 },
    })
    expect(repository.create).toHaveBeenCalled()
    expect(repository.remove).not.toHaveBeenCalled()
    expect(repository.incrementRowsUploaded).toHaveBeenCalledWith({
      id: "row_1",
      workspaceId: "w1",
      by: 10_000,
    })
  })

  test("a non-upload error after the Meta create is reported as partial", async () => {
    graph.uploadAudienceUsersSession.mockRejectedValue(new Error("boom"))
    await expect(
      service.create(createInput("email\na@b.co\n")),
    ).rejects.toMatchObject({
      code: "audiencePartialUpload",
      data: { received: 0 },
    })
  })

  test("a failed row insert after the Meta create is reported as partial", async () => {
    repository.create.mockRejectedValueOnce(new Error("db down"))
    await expect(
      service.create(createInput("email\na@b.co\n")),
    ).rejects.toMatchObject({ code: "audiencePartialUpload" })
    expect(graph.uploadAudienceUsersSession).not.toHaveBeenCalled()
  })

  test("a failing counter update does not mask the partial error", async () => {
    graph.uploadAudienceUsersSession.mockRejectedValue(
      new AudienceUploadError(10_000, 0),
    )
    repository.incrementRowsUploaded.mockRejectedValueOnce(new Error("db down"))
    await expect(
      service.create(createInput("email\na@b.co\n")),
    ).rejects.toMatchObject({
      code: "audiencePartialUpload",
      data: { received: 10_000 },
    })
  })

  test("errors before the Meta create stay unmapped to partial", async () => {
    graph.createMarketingMessagesAudience.mockRejectedValue(new Error("graph"))
    await expect(
      service.create(createInput("email\na@b.co\n")),
    ).rejects.not.toMatchObject({ code: "audiencePartialUpload" })
  })
})

describe("uploadMore", () => {
  test("uploads to the existing audience and accumulates", async () => {
    repository.findForWorkspace.mockResolvedValue({
      id: "row_1",
      customAudienceId: "aud_1",
    })
    const result = await service.uploadMore({
      workspaceId: "w1",
      grant,
      id: "row_1",
      file: csv("email\na@b.co\n"),
    })
    expect(result.received).toBe(2)
    expect(graph.createMarketingMessagesAudience).not.toHaveBeenCalled()
    expect(
      graph.uploadAudienceUsersSession.mock.calls[0]?.[0].customAudienceId,
    ).toBe("aud_1")
    expect(repository.incrementRowsUploaded).toHaveBeenCalledWith({
      id: "row_1",
      workspaceId: "w1",
      by: 2,
    })
  })

  test("unknown row → audienceNotFound", async () => {
    repository.findForWorkspace.mockResolvedValue(null)
    await expect(
      service.uploadMore({
        workspaceId: "w1",
        grant,
        id: "x",
        file: csv("email\na@b.co\n"),
      }),
    ).rejects.toMatchObject({ code: "audienceNotFound" })
  })
})

describe("delete", () => {
  beforeEach(() => {
    repository.findForWorkspace.mockResolvedValue({
      id: "row_1",
      customAudienceId: "aud_1",
      name: "VIP",
    })
    messageRepository.countByAudienceId.mockResolvedValue(0)
  })

  test("refuses an audience a marketing message targets, before calling Meta", async () => {
    messageRepository.countByAudienceId.mockResolvedValue(2)
    await expect(
      service.delete({ workspaceId: "w1", grant, id: "row_1" }),
    ).rejects.toMatchObject({ code: "audienceInUse", data: { count: 2 } })
    expect(graph.deleteCustomAudience).not.toHaveBeenCalled()
    expect(repository.remove).not.toHaveBeenCalled()
  })

  test("deletes on Meta then locally", async () => {
    graph.deleteCustomAudience.mockResolvedValue({ status: "deleted" })
    await service.delete({ workspaceId: "w1", grant, id: "row_1" })
    expect(repository.remove).toHaveBeenCalledWith({
      id: "row_1",
      workspaceId: "w1",
    })
  })

  test("still deletes locally when Meta says it no longer exists", async () => {
    graph.deleteCustomAudience.mockResolvedValue({ status: "notFound" })
    await service.delete({ workspaceId: "w1", grant, id: "row_1" })
    expect(repository.remove).toHaveBeenCalled()
  })

  test("keeps the row on any other Graph error", async () => {
    graph.deleteCustomAudience.mockRejectedValue(new Error("Permissions error"))
    await expect(
      service.delete({ workspaceId: "w1", grant, id: "row_1" }),
    ).rejects.toThrow("Permissions error")
    expect(repository.remove).not.toHaveBeenCalled()
  })
})
