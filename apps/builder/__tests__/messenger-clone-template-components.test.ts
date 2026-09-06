// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

const resumableUploadImage = vi.fn(async () => "new-handle")

vi.mock("@chatbotx.io/integration-messenger/apis/upload", () => ({
  resumableUploadImage,
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  integrationMessengerRepository: {
    findMessageTemplateForClone: vi.fn(),
    findPageIdById: vi.fn(),
    listByIds: vi.fn(),
  },
}))

vi.mock("@chatbotx.io/integration-messenger/apis/message-templates", () => ({
  createPageMessageTemplate: vi.fn(),
}))

vi.mock("@chatbotx.io/redis", () => ({
  invalidateCacheByTags: vi.fn(),
}))

vi.mock(
  "@/features/integration-messenger/message-templates/actions/sync-message-templates",
  () => ({
    syncMessengerMessageTemplatesForIntegration: vi.fn(),
  }),
)

vi.mock("@/features/workspace-members/queries", () => ({
  getAllWorkspaceMembers: vi.fn(),
}))

vi.mock("@/lib/safe-action", () => ({
  workspaceActionClient: {
    bindArgsSchemas: vi.fn(() => ({
      schema: vi.fn(() => ({
        action: vi.fn(),
      })),
    })),
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
