import { describe, expect, test } from "vitest"
import {
  composedPostBadge,
  composedPostTime,
} from "@/features/social-posts/lib/composed-post-row"
import type { ComposerPost } from "@/features/social-posts/lib/composer-state"

const post = (
  status: ComposerPost["status"],
  targets: Partial<ComposerPost["targets"][number]>[] = [],
): ComposerPost =>
  ({ status, targets: targets as ComposerPost["targets"] }) as ComposerPost

describe("composedPostBadge", () => {
  test("maps the post state to Draft, Scheduled, Failed or Published", () => {
    expect(composedPostBadge(post("draft"))).toBe("draft")
    expect(composedPostBadge(post("scheduled"))).toBe("scheduled")
    expect(composedPostBadge(post("publishing"))).toBe("scheduled")
    expect(composedPostBadge(post("published"))).toBe("published")
    expect(composedPostBadge(post("failed"))).toBe("failed")
    expect(composedPostBadge(post("partiallyPublished"))).toBe("failed")
  })

  test("a failing or unconfirmed destination makes the post Failed", () => {
    expect(
      composedPostBadge(post("scheduled", [{ status: "needsReview" }])),
    ).toBe("failed")
  })
})

describe("composedPostTime", () => {
  test("is the earliest destination time, published before planned", () => {
    const a = new Date("2026-09-02T00:00:00Z")
    const b = new Date("2026-09-01T00:00:00Z")

    expect(
      composedPostTime(
        post("scheduled", [
          { publishedAt: null, scheduledAt: a },
          { publishedAt: b, scheduledAt: null },
        ]),
      ),
    ).toEqual(b)
    expect(
      composedPostTime(
        post("draft", [{ scheduledAt: null, publishedAt: null }]),
      ),
    ).toBeNull()
  })
})
