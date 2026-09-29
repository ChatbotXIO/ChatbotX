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
    instagramBusinessClient: { get: mockGet },
  }
})

const { messageHandlers } = await import("../src/handlers/message")

const createProps = (graphMessageId = "message-1") =>
  ({
    ctx: {
      auth: {
        tokens: { accessToken: "instagram-token" },
        metadata: { version: "v23.0" },
      },
    },
    data: { graphMessageId },
  }) as never

describe("Instagram getMessageMediaUrls", () => {
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
            mime_type: "video/mp4",
            video_data: { url: "https://cdn.example/video.mp4" },
          },
          {
            id: "graph-attachment-2",
            file_url: "https://cdn.example/audio.m4a",
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
        url: "https://cdn.example/video.mp4",
        mimeType: "video/mp4",
      },
      {
        sourceId: "graph-attachment-2",
        url: "https://cdn.example/audio.m4a",
        mimeType: null,
      },
    ])
    expect(mockGet).toHaveBeenCalledWith("v23.0/message-1", {
      headers: { Authorization: "Bearer instagram-token" },
      searchParams: {
        fields:
          "attachments{id,name,mime_type,size,payload,image_data,video_data,file_url}",
      },
    })
  })

  test("drops an attachment that has a URL but no provider id", async () => {
    mockGet.mockResolvedValue({
      attachments: {
        data: [
          {
            mime_type: "image/jpeg",
            image_data: { url: "https://cdn.example/no-id.jpg" },
          },
          {
            id: "graph-attachment-1",
            mime_type: "image/png",
            image_data: { url: "https://cdn.example/kept.png" },
          },
        ],
      },
    })

    await expect(
      messageHandlers.getMessageMediaUrls(createProps()),
    ).resolves.toEqual([
      {
        sourceId: "graph-attachment-1",
        url: "https://cdn.example/kept.png",
        mimeType: "image/png",
      },
    ])
  })

  test("returns an empty array when Graph has no attachments", async () => {
    mockGet.mockResolvedValue({ attachments: { data: [] } })

    await expect(
      messageHandlers.getMessageMediaUrls(createProps()),
    ).resolves.toEqual([])
  })
})
