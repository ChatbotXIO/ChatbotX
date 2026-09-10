// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

const resumableUploadImage = vi.fn(async () => "new-handle")
const createPageMessageTemplate = vi.fn()
const syncTemplates = vi.fn()
const findByIdForWorkspace = vi.fn()
const listCloneTargetsForUser = vi.fn()
const templateService = {
  findByIdForWorkspace: vi.fn(),
  findCloneCandidate: vi.fn(),
  reserveClone: vi.fn(),
  fulfillReservation: vi.fn(),
  discardReservation: vi.fn(),
  linkClone: vi.fn(),
}

// Captures the handlers the safe-action chain wraps so the pipeline can be
// exercised directly (first registration = clone, second = recheck).
const capturedHandlers: ((props: unknown) => Promise<unknown>)[] = []

vi.mock("@chatbotx.io/integration-messenger/apis/upload", () => ({
  resumableUploadImage,
}))

vi.mock("@chatbotx.io/business", () => ({
  isCloneReservationSourceId: (sourceId: string) =>
    sourceId.startsWith("clone:"),
  messengerIntegrationService: {
    findByIdForWorkspace: (...args: unknown[]) => findByIdForWorkspace(...args),
    listCloneTargetsForUser: (...args: unknown[]) =>
      listCloneTargetsForUser(...args),
  },
  messengerMessageTemplateService: templateService,
}))

vi.mock("@chatbotx.io/integration-messenger/apis/message-templates", () => ({
  createPageMessageTemplate: (...args: unknown[]) =>
    createPageMessageTemplate(...args),
}))

vi.mock("@chatbotx.io/redis", () => ({
  invalidateCacheByTags: vi.fn(),
}))

vi.mock(
  "@/features/integration-messenger/message-templates/actions/sync-message-templates",
  () => ({
    syncMessengerMessageTemplatesForIntegration: (...args: unknown[]) =>
      syncTemplates(...args),
  }),
)

vi.mock("@/lib/safe-action", () => ({
  workspaceActionClient: {
    bindArgsSchemas: () => ({
      schema: () => ({
        action: (handler: (props: unknown) => Promise<unknown>) => {
          capturedHandlers.push(handler)
          return handler
        },
      }),
    }),
  },
}))

const { prepareComponentsForClone } = await import(
  "@/features/integration-messenger/message-templates/lib/clone-pipeline"
)
await import(
  "@/features/integration-messenger/message-templates/actions/clone-message-templates"
)

describe("prepareComponentsForClone", () => {
  beforeEach(() => {
    resumableUploadImage.mockClear()
  })

  test("rejects opaque Meta image handles", async () => {
    const components = [
      {
        type: "HEADER",
        format: "IMAGE",
        example: {
          header_handle: ["4:opaque-meta-handle"],
        },
      },
    ]

    await expect(
      prepareComponentsForClone(components, {} as never),
    ).rejects.toThrow("Image header cannot be cloned")
    expect(resumableUploadImage).not.toHaveBeenCalled()
  })

  test("re-uploads stored public image URLs without bearer auth", async () => {
    const components = [
      {
        type: "HEADER",
        format: "IMAGE",
        example: {
          header_handle: ["https://storage.test/header.jpg"],
        },
      },
    ]

    const result = await prepareComponentsForClone(components, {} as never)

    expect(resumableUploadImage).toHaveBeenCalledWith(
      {},
      "https://storage.test/header.jpg",
      { authenticatedDownload: false },
    )
    expect(result[0].example).toMatchObject({ header_handle: ["new-handle"] })
  })

  test("re-uploads Meta image URLs with bearer auth", async () => {
    const components = [
      {
        type: "HEADER",
        format: "IMAGE",
        example: {
          header_handle: ["https://lookaside.facebook.com/header.jpg"],
        },
      },
    ]

    const result = await prepareComponentsForClone(components, {} as never)

    expect(resumableUploadImage).toHaveBeenCalledWith(
      {},
      "https://lookaside.facebook.com/header.jpg",
      { authenticatedDownload: true },
    )
    expect(result[0].example).toMatchObject({ header_handle: ["new-handle"] })
  })

  test("refuses malformed stored components instead of crashing on them", async () => {
    await expect(
      prepareComponentsForClone("not-an-array", {} as never),
    ).rejects.toThrow("Template components are malformed")
    await expect(
      prepareComponentsForClone([null], {} as never),
    ).rejects.toThrow("Template components are malformed")
  })

  test("re-uploads legacy opaque Meta handles from stored public image URL", async () => {
    const components = [
      {
        type: "HEADER",
        format: "IMAGE",
        example: {
          header_handle: ["4:opaque-meta-handle"],
          header_image_url: "https://storage.test/header.jpg",
        },
      },
    ]

    const result = await prepareComponentsForClone(components, {} as never)

    expect(resumableUploadImage).toHaveBeenCalledWith(
      {},
      "https://storage.test/header.jpg",
      { authenticatedDownload: false },
    )
    expect(result[0].example).toEqual({
      header_handle: ["new-handle"],
    })
  })
})

const [cloneHandler, recheckHandler] = capturedHandlers

type CloneResult = {
  succeeded: { channel: string }[]
  failed: { channel: string; error: string }[]
  pending: { channel: string }[]
  targets: {
    integrationMessengerId: string
    status: string
    templateId?: string
    error?: string
  }[]
}

const sourceTemplate = {
  id: "tpl-src",
  integrationMessengerId: "im-source",
  name: "promo",
  language: "vi",
  category: "MARKETING",
  status: "APPROVED",
  parameterFormat: "POSITIONAL",
  components: [{ type: "BODY", text: "Hi" }],
  sourceId: "meta-src",
  clonedFromTemplateId: null,
  rejectionReason: null,
}
const targetRow = (
  id: string,
  status: string,
  overrides: Partial<{
    clonedFromTemplateId: string | null
    rejectionReason: string | null
    sourceId: string
  }> = {},
) => ({
  id,
  integrationMessengerId: "im-a",
  name: "promo",
  language: "vi",
  category: "MARKETING",
  status,
  parameterFormat: "POSITIONAL",
  components: [],
  sourceId: `meta-${id}`,
  clonedFromTemplateId: null,
  rejectionReason: null,
  ...overrides,
})
const target = (id: string, workspaceId = "ws-other") => ({
  id,
  name: `Page ${id}`,
  workspaceId,
  pageId: `page-${id}`,
  auth: { accessToken: "token" },
})

const run = (
  handler: (props: unknown) => Promise<unknown>,
  targetIntegrationMessengerIds: string[],
) =>
  handler({
    bindArgsParsedInputs: ["ws-source", "im-source", "tpl-src"],
    parsedInput: { targetIntegrationMessengerIds },
    ctx: { user: { id: "user-1" } },
  }) as Promise<CloneResult>

describe("cloneMessengerMessageTemplateAction pipeline", () => {
  beforeEach(() => {
    for (const fn of Object.values(templateService)) {
      fn.mockReset()
    }
    templateService.findByIdForWorkspace.mockResolvedValue(sourceTemplate)
    templateService.findCloneCandidate.mockResolvedValue(null)
    templateService.linkClone.mockResolvedValue(undefined)
    templateService.discardReservation.mockResolvedValue(undefined)
    findByIdForWorkspace
      .mockReset()
      .mockResolvedValue({ id: "im-source", pageId: "page-source" })
    listCloneTargetsForUser.mockReset().mockResolvedValue([target("im-a")])
    createPageMessageTemplate.mockReset()
    syncTemplates.mockReset().mockResolvedValue(undefined)
    resumableUploadImage.mockClear()
  })

  test("authorizes through the shared clone-target list and rejects a non-approved source", async () => {
    listCloneTargetsForUser.mockResolvedValue([target("im-a")])
    templateService.findByIdForWorkspace.mockResolvedValue({
      ...sourceTemplate,
      status: "PENDING",
    })

    await expect(run(cloneHandler, ["im-a"])).rejects.toThrow(
      "Only an approved template can be cloned",
    )
    expect(createPageMessageTemplate).not.toHaveBeenCalled()
  })

  test("drops requested pages the user does not administer and fails when none remain", async () => {
    await expect(run(cloneHandler, ["im-foreign"])).rejects.toThrow(
      "No authorized target channels found",
    )
    expect(listCloneTargetsForUser).toHaveBeenCalledWith({
      userId: "user-1",
      excludePageId: "page-source",
      authoritative: true,
    })
  })

  test("reuses an approved template already on the page and records the clone link", async () => {
    templateService.findCloneCandidate.mockResolvedValue(
      targetRow("tpl-a", "APPROVED"),
    )

    const result = await run(cloneHandler, ["im-a"])

    expect(result.succeeded).toEqual([{ channel: "Page im-a" }])
    expect(result.targets[0]).toMatchObject({
      status: "alreadyApproved",
      templateId: "tpl-a",
    })
    expect(templateService.linkClone).toHaveBeenCalledWith({
      id: "tpl-a",
      clonedFromTemplateId: "tpl-src",
    })
    expect(templateService.reserveClone).not.toHaveBeenCalled()
    expect(createPageMessageTemplate).not.toHaveBeenCalled()
  })

  test("reports a rejected clone with Meta's reason without creating again", async () => {
    templateService.findCloneCandidate.mockResolvedValue(
      targetRow("tpl-b", "REJECTED", {
        rejectionReason: "Too promotional",
        clonedFromTemplateId: "tpl-src",
      }),
    )

    const result = await run(cloneHandler, ["im-a"])

    expect(result.failed).toEqual([
      { channel: "Page im-a", error: "Too promotional" },
    ])
    expect(syncTemplates).not.toHaveBeenCalled()
    expect(createPageMessageTemplate).not.toHaveBeenCalled()
    expect(templateService.linkClone).not.toHaveBeenCalled()
  })

  test("re-reads a pending clone from Meta and reports its current status", async () => {
    const pending = targetRow("tpl-a", "PENDING", {
      clonedFromTemplateId: "tpl-src",
    })
    templateService.findCloneCandidate
      .mockResolvedValueOnce(pending)
      .mockResolvedValueOnce({ ...pending, status: "APPROVED" })

    const result = await run(cloneHandler, ["im-a"])

    expect(syncTemplates).toHaveBeenCalledWith(
      expect.objectContaining({
        templateName: "promo",
        templateLanguage: "vi",
      }),
    )
    expect(result.succeeded).toEqual([{ channel: "Page im-a" }])
    expect(result.targets[0]).toMatchObject({
      status: "alreadyApproved",
      templateId: "tpl-a",
    })
    expect(createPageMessageTemplate).not.toHaveBeenCalled()
    expect(templateService.linkClone).not.toHaveBeenCalled()
  })

  test("keeps reporting pending when Meta has not decided yet", async () => {
    const pending = targetRow("tpl-a", "PENDING", {
      clonedFromTemplateId: "tpl-src",
    })
    templateService.findCloneCandidate
      .mockResolvedValueOnce(pending)
      .mockResolvedValueOnce(pending)

    const result = await run(cloneHandler, ["im-a"])

    expect(syncTemplates).toHaveBeenCalledTimes(1)
    expect(result.pending).toEqual([{ channel: "Page im-a" }])
    expect(createPageMessageTemplate).not.toHaveBeenCalled()
  })

  test("leaves another clone's in-flight reservation alone", async () => {
    templateService.findCloneCandidate.mockResolvedValue(
      targetRow("res-other", "PENDING", {
        clonedFromTemplateId: "tpl-src",
        sourceId: "clone:tpl-src",
      }),
    )

    const result = await run(cloneHandler, ["im-a"])

    expect(syncTemplates).not.toHaveBeenCalled()
    expect(result.pending).toEqual([{ channel: "Page im-a" }])
    expect(templateService.reserveClone).not.toHaveBeenCalled()
  })

  test("resyncs the page by name before creating, so a template missing locally is reused", async () => {
    templateService.findCloneCandidate
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(targetRow("tpl-a", "APPROVED"))

    const result = await run(cloneHandler, ["im-a"])

    expect(syncTemplates).toHaveBeenCalledWith(
      expect.objectContaining({
        templateName: "promo",
        templateLanguage: "vi",
        workspaceId: "ws-other",
      }),
    )
    expect(result.targets[0].status).toBe("alreadyApproved")
    expect(createPageMessageTemplate).not.toHaveBeenCalled()
  })

  test("reserves the pair, creates on Meta and stores the response immediately whatever its status", async () => {
    templateService.reserveClone.mockResolvedValue({
      outcome: "reserved",
      row: { id: "res-1" },
    })
    createPageMessageTemplate.mockResolvedValue({
      id: "meta-new",
      status: "PENDING",
      name: "promo",
      language: "vi",
      category: "MARKETING",
      components: [],
    })
    templateService.fulfillReservation.mockResolvedValue(
      targetRow("res-1", "PENDING", { clonedFromTemplateId: "tpl-src" }),
    )

    const result = await run(cloneHandler, ["im-a"])

    expect(templateService.reserveClone).toHaveBeenCalledWith({
      integrationMessengerId: "im-a",
      clonedFromTemplateId: "tpl-src",
      template: expect.objectContaining({
        name: "promo",
        language: "vi",
        category: "MARKETING",
      }),
    })
    expect(templateService.fulfillReservation).toHaveBeenCalledWith({
      reservationId: "res-1",
      template: expect.objectContaining({ id: "meta-new", status: "PENDING" }),
    })
    expect(result.pending).toEqual([{ channel: "Page im-a" }])
    expect(result.targets[0]).toMatchObject({
      status: "pending",
      templateId: "res-1",
    })
  })

  test("an approved Meta response counts as a fresh clone", async () => {
    templateService.reserveClone.mockResolvedValue({
      outcome: "reserved",
      row: { id: "res-1" },
    })
    createPageMessageTemplate.mockResolvedValue({
      id: "meta-new",
      status: "APPROVED",
      name: "promo",
      language: "vi",
      category: "MARKETING",
      components: [],
    })
    templateService.fulfillReservation.mockResolvedValue(
      targetRow("res-1", "APPROVED"),
    )

    const result = await run(cloneHandler, ["im-a"])

    expect(result.succeeded).toEqual([{ channel: "Page im-a" }])
    expect(result.targets[0].status).toBe("approved")
  })

  test("a concurrent clone that already reserved the pair is reported as pending without calling Meta", async () => {
    templateService.reserveClone.mockResolvedValue({ outcome: "conflict" })

    const result = await run(cloneHandler, ["im-a"])

    expect(result.pending).toEqual([{ channel: "Page im-a" }])
    expect(createPageMessageTemplate).not.toHaveBeenCalled()
  })

  test("a failed Meta create drops the reservation and reuses the template Meta already has", async () => {
    templateService.reserveClone.mockResolvedValue({
      outcome: "reserved",
      row: { id: "res-1" },
    })
    createPageMessageTemplate.mockRejectedValue(
      new Error("A template with this name already exists"),
    )
    templateService.findCloneCandidate
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(targetRow("tpl-existing", "APPROVED"))

    const result = await run(cloneHandler, ["im-a"])

    expect(templateService.discardReservation).toHaveBeenCalledWith("res-1")
    expect(templateService.linkClone).toHaveBeenCalledWith({
      id: "tpl-existing",
      clonedFromTemplateId: "tpl-src",
    })
    expect(result.targets[0]).toMatchObject({
      status: "alreadyApproved",
      templateId: "tpl-existing",
    })
  })

  test("a reservation swept while Meta was creating is recovered by re-reading the page", async () => {
    templateService.reserveClone.mockResolvedValue({
      outcome: "reserved",
      row: { id: "res-1" },
    })
    createPageMessageTemplate.mockResolvedValue({
      id: "meta-new",
      status: "PENDING",
      name: "promo",
      language: "vi",
      category: "MARKETING",
      components: [],
    })
    templateService.fulfillReservation.mockRejectedValue(
      new Error("Clone reservation res-1 no longer exists"),
    )
    templateService.findCloneCandidate
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(
        targetRow("tpl-synced", "PENDING", { sourceId: "meta-new" }),
      )

    const result = await run(cloneHandler, ["im-a"])

    expect(templateService.discardReservation).toHaveBeenCalledWith("res-1")
    expect(templateService.linkClone).toHaveBeenCalledWith({
      id: "tpl-synced",
      clonedFromTemplateId: "tpl-src",
    })
    expect(result.pending).toEqual([{ channel: "Page im-a" }])
    expect(result.targets[0].templateId).toBe("tpl-synced")
  })

  test("a failed Meta create with nothing on the page is reported as failed", async () => {
    templateService.reserveClone.mockResolvedValue({
      outcome: "reserved",
      row: { id: "res-1" },
    })
    createPageMessageTemplate.mockRejectedValue(new Error("rate limited"))

    const result = await run(cloneHandler, ["im-a"])

    expect(templateService.discardReservation).toHaveBeenCalledWith("res-1")
    expect(result.failed).toEqual([
      { channel: "Page im-a", error: "rate limited" },
    ])
  })

  test("an unexpected error on one page never blocks the other pages", async () => {
    listCloneTargetsForUser.mockResolvedValue([
      target("im-a"),
      { ...target("im-b"), id: "im-b" },
    ])
    templateService.findCloneCandidate
      .mockRejectedValueOnce(new Error("db down"))
      .mockResolvedValueOnce(targetRow("tpl-b", "APPROVED"))

    const result = await run(cloneHandler, ["im-a", "im-b"])

    expect(result.failed).toEqual([{ channel: "Page im-a", error: "db down" }])
    expect(result.succeeded).toEqual([{ channel: "Page im-b" }])
  })
})

describe("recheckMessengerTemplateClonesAction", () => {
  beforeEach(() => {
    for (const fn of Object.values(templateService)) {
      fn.mockReset()
    }
    templateService.findByIdForWorkspace.mockResolvedValue(sourceTemplate)
    findByIdForWorkspace
      .mockReset()
      .mockResolvedValue({ id: "im-source", pageId: "page-source" })
    listCloneTargetsForUser.mockReset().mockResolvedValue([target("im-a")])
    syncTemplates.mockReset().mockResolvedValue(undefined)
    createPageMessageTemplate.mockReset()
  })

  test("resyncs each page by name and reports the fresh status without creating anything", async () => {
    templateService.findCloneCandidate.mockResolvedValue(
      targetRow("tpl-a", "APPROVED", { clonedFromTemplateId: "tpl-src" }),
    )

    const result = await run(recheckHandler, ["im-a"])

    expect(syncTemplates).toHaveBeenCalledWith(
      expect.objectContaining({
        templateName: "promo",
        templateLanguage: "vi",
      }),
    )
    expect(result.succeeded).toEqual([{ channel: "Page im-a" }])
    expect(createPageMessageTemplate).not.toHaveBeenCalled()
    expect(templateService.reserveClone).not.toHaveBeenCalled()
  })

  test("reports a page where the template is gone from Meta as failed", async () => {
    templateService.findCloneCandidate.mockResolvedValue(null)

    const result = await run(recheckHandler, ["im-a"])

    expect(result.failed).toEqual([
      { channel: "Page im-a", error: "Template not found on page" },
    ])
  })
})
