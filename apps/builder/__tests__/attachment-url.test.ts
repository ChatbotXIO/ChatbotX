import { describe, expect, test } from "vitest"
import { toAttachmentUrl } from "@/features/attachments/utils"

const STORAGE_URL = "https://storage.example.com/"

describe("toAttachmentUrl", () => {
  test("uses the server-resolved URL when there is one", () => {
    expect(
      toAttachmentUrl(
        { originPath: "workspace/a/b.jpg", url: "https://signed.example/b" },
        STORAGE_URL,
      ),
    ).toBe("https://signed.example/b")
  })

  test("treats a server-resolved null as terminal", () => {
    expect(
      toAttachmentUrl(
        { originPath: "workspace/a/b.jpg", url: null },
        STORAGE_URL,
      ),
    ).toBeUndefined()
  })

  test("joins a stored key onto the storage URL when no URL was resolved", () => {
    expect(
      toAttachmentUrl({ originPath: "workspace/a/b.jpg" }, STORAGE_URL),
    ).toBe("https://storage.example.com/workspace/a/b.jpg")
  })

  test.each([
    "https://scontent.example/photo.jpg?sig=abc",
    "http://scontent.example/photo.jpg",
    "wa-media:12345",
    "failed:unresolvable",
  ])("never hotlinks a pending or failed reference: %s", (originPath) => {
    // A pending originPath is an expiring provider URL (or a media id): the
    // browser must go through the signed proxy URL, never fetch it directly.
    expect(toAttachmentUrl({ originPath }, STORAGE_URL)).toBeUndefined()
  })
})
