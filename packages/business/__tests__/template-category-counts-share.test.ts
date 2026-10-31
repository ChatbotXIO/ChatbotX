// @vitest-environment node

import { describe, expect, test } from "vitest"
import { categoryCountsOfPayload } from "../src/template/category-counts"
import { assertCanWriteTemplateInstalls } from "../src/template/permissions"
import { isShareLive } from "../src/template/share-live"

const payload = {
  manifests: {
    tags: { t1: {}, t2: {} },
    customFields: { c1: {} },
    productCategories: { p1: {}, p2: {}, p3: {} },
  },
  resources: {
    settings: { savedReplies: [{}], botFields: [{}, {}] },
    flows: [{}],
    products: [],
    aiFunctions: [],
    aiAgents: [],
    calendars: [],
    webchats: [],
    keywords: [],
    entryPointLinks: [],
    triggers: [],
    fbCommentAutomations: [],
    sequences: [],
    aiMcpServers: [],
    aiFiles: [],
    questionnaires: [],
    couponTopics: [],
    pipelines: [{}],
  },
}

describe("categoryCountsOfPayload", () => {
  test("counts manifests (including product categories) and resources", () => {
    expect(categoryCountsOfPayload(payload as never)).toMatchObject({
      tags: 2,
      customFields: 1,
      productCategories: 3,
      settings: 3,
      flows: 1,
      products: 0,
      pipelines: 1,
    })
  })
})

describe("isShareLive", () => {
  const now = Date.parse("2026-01-02T00:00:00Z")

  test("is off when sharing is disabled", () => {
    expect(
      isShareLive({ shareEnabled: false, shareExpiresAt: null }, now),
    ).toBe(false)
  })

  test("is on without an expiry", () => {
    expect(isShareLive({ shareEnabled: true, shareExpiresAt: null }, now)).toBe(
      true,
    )
  })

  test("is off once the expiry passed", () => {
    expect(
      isShareLive(
        {
          shareEnabled: true,
          shareExpiresAt: new Date("2026-01-01T00:00:00Z"),
        },
        now,
      ),
    ).toBe(false)
  })
})

describe("assertCanWriteTemplateInstalls", () => {
  test("rejects a read-only token", () => {
    expect(() =>
      assertCanWriteTemplateInstalls({
        kind: "apiToken",
        permission: "read_only",
      }),
    ).toThrow(
      expect.objectContaining({ code: "templateManagePermissionDenied" }),
    )
  })

  test("allows a full token and a member", () => {
    expect(() =>
      assertCanWriteTemplateInstalls({ kind: "apiToken", permission: "full" }),
    ).not.toThrow()
    expect(() =>
      assertCanWriteTemplateInstalls({ kind: "member", permissions: {} }),
    ).not.toThrow()
  })
})
