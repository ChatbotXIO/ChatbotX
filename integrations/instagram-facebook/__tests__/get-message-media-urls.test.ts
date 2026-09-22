import { beforeEach, describe, expect, test, vi } from "vitest"

const mockGet = vi.hoisted(() => vi.fn())

vi.mock("../src/exception", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/exception")>()
  return { ...actual, rescue: (_: string, fn: () => Promise<unknown>) => fn() }
})

vi.mock("../src/lib/http-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/http-client")>()
  return {
    ...actual,
    instagramGraphClient: { get: mockGet },
  }
})

const { messageHandlers } = await import("../src/handlers/message")

const createProps = (graphMessageId = "message-1") =>
  ({
    ctx: {
      auth: {
        tokens: { accessToken: "page-token" },
        metadata: { version: "v23.0" },
      },
    },
    data: { graphMessageId },
  }) as never

describe("Instagram via Facebook getMessageMediaUrls", () => {
  beforeEach(() => {
    mockGet.mockReset()
  })

  test("returns every attachment URL in Graph order", async () => {
    mockGet.mockResolvedValue({
      attachments: {
        data: [
          {
            id: "graph-attachment-0",
            mime_type: "image/webp",
            payload: { url: "https://cdn.example/payload.webp" },
            image_data: { url: "https://cdn.example/fallback.jpg" },
          },
          {
            id: "graph-attachment-1",
            mime_type: "image/jpeg",
            image_data: { url: "https://cdn.example/image.jpg" },
          },
          {
            id: "graph-attachment-2",
            mime_type: "application/pdf",
            file_url: "https://cdn.example/file.pdf",
          },
        ],
      },
    })

    await expect(
      messageHandlers.getMessageMediaUrls(createProps()),
    ).resolves.toEqual([
      {
        sourceId: "graph-attachment-0",
        url: "https://cdn.example/payload.webp",
        mimeType: "image/webp",
      },
      {
        sourceId: "graph-attachment-1",
        url: "https://cdn.example/image.jpg",
        mimeType: "image/jpeg",
      },
      {
        sourceId: "graph-attachment-2",
        url: "https://cdn.example/file.pdf",
        mimeType: "application/pdf",
      },
    ])
    expect(mockGet).toHaveBeenCalledWith("v23.0/message-1", {
      headers: { Authorization: "Bearer page-token" },
      searchParams: {
        fields:
          "attachments{id,name,mime_type,size,payload,image_data,video_data,file_url}",
      },
    })
  })

  test("returns an empty array when Graph has no attachments", async () => {
    mockGet.mockResolvedValue({ id: "message-1" })

    await expect(
      messageHandlers.getMessageMediaUrls(createProps()),
    ).resolves.toEqual([])
  })
})
