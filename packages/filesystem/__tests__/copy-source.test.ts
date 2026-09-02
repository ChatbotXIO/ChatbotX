import { describe, expect, test } from "vitest"
import { buildCopySource } from "../src/lib/copy-source"

describe("buildCopySource", () => {
  test("uses bucket/key when no endpoint is configured", () => {
    expect(buildCopySource("public/space/1/file.jpg", "mybucket")).toBe(
      "mybucket/public/space/1/file.jpg",
    )
  })

  test("uses bucket/key when endpoint has no path", () => {
    expect(
      buildCopySource(
        "public/space/1/file.jpg",
        "mybucket",
        "https://account.r2.cloudflarestorage.com",
      ),
    ).toBe("mybucket/public/space/1/file.jpg")
  })

  test("replicates the endpoint path prefix when endpoint includes it", () => {
    // Endpoint mistakenly (or intentionally) carries the bucket in its path:
    // every URL-addressed op stores objects under "chatconnectx/<key>", so the
    // header-addressed CopySource must point at the same real key.
    expect(
      buildCopySource(
        "public/space/1/file.jpg",
        "chatconnectx",
        "https://account.r2.cloudflarestorage.com/chatconnectx",
      ),
    ).toBe("chatconnectx/chatconnectx/public/space/1/file.jpg")
  })

  test("handles endpoint path with trailing slash", () => {
    expect(
      buildCopySource("a/b.png", "bkt", "https://host.example.com/prefix/"),
    ).toBe("prefix/bkt/a/b.png")
  })

  test("URL-encodes each key segment", () => {
    expect(buildCopySource("a b/c#d.png", "bkt")).toBe("bkt/a%20b/c%23d.png")
  })
})
