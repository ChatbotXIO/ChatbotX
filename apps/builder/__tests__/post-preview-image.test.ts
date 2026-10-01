import { describe, expect, test } from "vitest"
import { resolvePostPreviewImage } from "@/features/shared/comment-automation/lib/post-preview-image"

describe("resolvePostPreviewImage", () => {
  test("uses media_url for an image post", () => {
    expect(
      resolvePostPreviewImage({
        media_type: "IMAGE",
        media_url: "https://cdn.example.com/photo.jpg",
      }),
    ).toBe("https://cdn.example.com/photo.jpg")
  })

  test("uses thumbnail_url for a video post, never the .mp4 media_url", () => {
    expect(
      resolvePostPreviewImage({
        media_type: "VIDEO",
        media_url: "https://cdn.example.com/video.mp4",
        thumbnail_url: "https://cdn.example.com/thumb.jpg",
      }),
    ).toBe("https://cdn.example.com/thumb.jpg")
  })

  test("returns no image for a video post without a thumbnail", () => {
    expect(
      resolvePostPreviewImage({
        media_type: "VIDEO",
        media_url: "https://cdn.example.com/video.mp4",
      }),
    ).toBeUndefined()
  })

  test("returns no image for a text-only post", () => {
    expect(resolvePostPreviewImage({ media_type: "TEXT_POST" })).toBeUndefined()
  })
})
