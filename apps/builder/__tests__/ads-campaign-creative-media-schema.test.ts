import { describe, expect, test } from "vitest"
import { createMessagingAdRequest } from "@/features/ads-campaign/schema/wizard"

// ---------------------------------------------------------------------------
// createMessagingAdRequest — the oRPC `.input()` boundary for the create-ad
// wizard. `creativeMediaSchema`'s image variant is new-shape-only (imageKey +
// fileId, never a legacy imageHash), and the whole-request `.refine` rejects
// a stored-image `imageKey` outside the caller's OWN workspace namespace
// before any Meta call happens.
// ---------------------------------------------------------------------------

function baseRequest(
  overrides: Partial<{ workspaceId: string; imageKey: string }> = {},
) {
  const workspaceId = overrides.workspaceId ?? "1"
  return {
    workspaceId,
    channel: "messenger" as const,
    integrationId: "2",
    adAccountId: "act_9",
    name: "My ad",
    campaign: { specialAdCategories: ["NONE"] },
    adSet: {
      dailyBudgetMinorUnits: 2000,
      targeting: { countries: ["US"] },
    },
    creative: {
      media: {
        kind: "image" as const,
        imageKey:
          overrides.imageKey ??
          `public/space/${workspaceId}/ads-campaign/creatives/abc123`,
        fileId: "file_1",
        link: "https://example.com",
      },
      welcomeMessage: { type: "default" as const },
    },
  }
}

describe("creativeMediaSchema (image) — new shape only", () => {
  test("accepts a valid workspace-namespaced imageKey + fileId", () => {
    const result = createMessagingAdRequest.safeParse(baseRequest())
    expect(result.success).toBe(true)
  })

  test("rejects a request missing fileId", () => {
    const request = baseRequest()
    // @ts-expect-error — intentionally omitting a required field
    request.creative.media.fileId = undefined
    const result = createMessagingAdRequest.safeParse(request)
    expect(result.success).toBe(false)
  })

  test("rejects the legacy { imageHash } shape (never re-submitted through this boundary)", () => {
    const request = {
      ...baseRequest(),
      creative: {
        media: {
          kind: "image",
          imageHash: "legacy_hash",
          link: "https://example.com",
        },
        welcomeMessage: { type: "default" },
      },
    }
    const result = createMessagingAdRequest.safeParse(request)
    expect(result.success).toBe(false)
  })
})

describe("createMessagingAdRequest — imageKey workspace-namespace check", () => {
  test("rejects an imageKey belonging to a DIFFERENT workspace", () => {
    const request = baseRequest({
      workspaceId: "1",
      imageKey: "public/space/2/ads-campaign/creatives/abc123",
    })
    const result = createMessagingAdRequest.safeParse(request)
    expect(result.success).toBe(false)
  })

  test("rejects an imageKey outside the ads-campaign/creatives prefix entirely", () => {
    const request = baseRequest({
      workspaceId: "1",
      imageKey: "public/space/1/products/images/abc123",
    })
    const result = createMessagingAdRequest.safeParse(request)
    expect(result.success).toBe(false)
  })
})
