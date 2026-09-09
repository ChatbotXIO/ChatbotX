// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

const resumableUploadImage = vi.fn(async () => "new-handle")
const createPageMessageTemplate = vi.fn()
const syncTemplates = vi.fn()
const findByIdForWorkspace = vi.fn()
const listCloneTargetsForUser = vi.fn()
const findByIdForIntegration = vi.fn()

// Captures the handler the safe-action chain wraps so the action's
// authorization can be exercised directly.
let cloneHandler: ((props: unknown) => Promise<unknown>) | null = null

vi.mock("@chatbotx.io/integration-messenger/apis/upload", () => ({
  resumableUploadImage,
}))

vi.mock("@chatbotx.io/business", () => ({
  messengerIntegrationService: {
    findByIdForWorkspace: (...args: unknown[]) => findByIdForWorkspace(...args),
    listCloneTargetsForUser: (...args: unknown[]) =>
      listCloneTargetsForUser(...args),
  },
  messengerMessageTemplateService: {
    findByIdForIntegration: (...args: unknown[]) =>
      findByIdForIntegration(...args),
  },
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
          cloneHandler = handler
          return handler
        },
      }),
    }),
  },
}))

const { prepareComponentsForClone } = await import(
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
    expect(result[0].example.header_handle).toEqual(["new-handle"])
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
    expect(result[0].example.header_handle).toEqual(["new-handle"])
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

type CloneResult = {
  succeeded: { channel: string }[]
  failed: { channel: string; error: string }[]
}

const sourceTemplate = {
  id: "tpl-src",
  integrationMessengerId: "im-source",
  name: "promo",
  language: "vi",
  category: "MARKETING",
  parameterFormat: "POSITIONAL",
  components: [{ type: "BODY", text: "Hi" }],
}
const target = (id: string, workspaceId = "ws-other") => ({
  id,
  name: `Page ${id}`,
  workspaceId,
  pageId: `page-${id}`,
  auth: { accessToken: "token" },
})

const run = (targetIntegrationMessengerIds: string[]) => {
  if (!cloneHandler) {
    throw new Error("clone action handler was not captured")
  }
  return cloneHandler({
    bindArgsParsedInputs: ["ws-source", "im-source", "tpl-src"],
    parsedInput: { targetIntegrationMessengerIds },
    ctx: { user: { id: "user-1" } },
  }) as Promise<CloneResult>
}

describe("cloneMessengerMessageTemplateAction authorization", () => {
  beforeEach(() => {
    findByIdForIntegration.mockReset().mockResolvedValue(sourceTemplate)
    findByIdForWorkspace
      .mockReset()
      .mockResolvedValue({ id: "im-source", pageId: "page-source" })
    listCloneTargetsForUser.mockReset()
    createPageMessageTemplate.mockReset().mockResolvedValue({
      id: "meta-new",
      status: "APPROVED",
    })
    syncTemplates.mockReset().mockResolvedValue(undefined)
    resumableUploadImage.mockClear()
  })

  test("clones onto the requested pages the user administers, read uncached", async () => {
    listCloneTargetsForUser.mockResolvedValue([
      target("im-admin"),
      target("im-owner", "ws-owner"),
    ])

    const result = await run(["im-admin", "im-owner"])

    expect(listCloneTargetsForUser).toHaveBeenCalledWith({
      userId: "user-1",
      excludePageId: "page-source",
      authoritative: true,
    })
    expect(createPageMessageTemplate).toHaveBeenCalledTimes(2)
    expect(result.succeeded).toEqual([
      { channel: "Page im-admin" },
      { channel: "Page im-owner" },
    ])
    expect(result.failed).toEqual([])
  })

  test("drops requested pages outside the user's admin workspaces", async () => {
    listCloneTargetsForUser.mockResolvedValue([target("im-admin")])

    const result = await run(["im-admin", "im-foreign"])

    expect(createPageMessageTemplate).toHaveBeenCalledTimes(1)
    expect(result.succeeded).toEqual([{ channel: "Page im-admin" }])
  })

  test("fails when none of the requested pages is authorized", async () => {
    listCloneTargetsForUser.mockResolvedValue([target("im-admin")])

    await expect(run(["im-foreign"])).rejects.toThrow(
      "No authorized target channels found",
    )
    expect(createPageMessageTemplate).not.toHaveBeenCalled()
  })

  test("reports a page whose Meta create fails without blocking the others", async () => {
    listCloneTargetsForUser.mockResolvedValue([target("im-a"), target("im-b")])
    createPageMessageTemplate
      .mockRejectedValueOnce(new Error("rate limited"))
      .mockResolvedValueOnce({ id: "meta-b", status: "APPROVED" })

    const result = await run(["im-a", "im-b"])

    expect(result.failed).toEqual([
      { channel: "Page im-a", error: "rate limited" },
    ])
    expect(result.succeeded).toEqual([{ channel: "Page im-b" }])
  })
})
