import { describe, expect, test } from "vitest"
import { getPublicFileUrl } from "../src/storage"

// The base of interest carries a bucket path segment (e.g. RustFS/S3 proxy),
// which is exactly the shape `new URL` silently drops when misused.
const BUCKET_BASE = "https://filesystem.example.com/chatbotx/"

describe("getPublicFileUrl", () => {
  test("joins a bare object key under the bucket base", () => {
    expect(getPublicFileUrl("public/space/1/avatar/abc", BUCKET_BASE)).toBe(
      "https://filesystem.example.com/chatbotx/public/space/1/avatar/abc",
    )
  })

  test("keeps the bucket even when the key has a leading slash", () => {
    // Naive `new URL("/public/...", base)` would drop "/chatbotx".
    expect(getPublicFileUrl("/public/space/1/avatar/abc", BUCKET_BASE)).toBe(
      "https://filesystem.example.com/chatbotx/public/space/1/avatar/abc",
    )
  })

  test("keeps the bucket even when the base has no trailing slash", () => {
    expect(
      getPublicFileUrl(
        "public/space/1/avatar/abc",
        "https://filesystem.example.com/chatbotx",
      ),
    ).toBe("https://filesystem.example.com/chatbotx/public/space/1/avatar/abc")
  })

  test("works with a bucket-less CDN base", () => {
    expect(getPublicFileUrl("public/x.png", "https://cdn.example.com/")).toBe(
      "https://cdn.example.com/public/x.png",
    )
  })

  test("returns an already-absolute http(s) path unchanged", () => {
    const absolute = "https://scontent.fbcdn.net/v/t1/avatar.jpg"
    expect(getPublicFileUrl(absolute, BUCKET_BASE)).toBe(absolute)
  })
})
