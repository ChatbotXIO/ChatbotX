// @vitest-environment node
import { describe, expect, test } from "vitest"
import { BROADCAST_AUDIENCE_PREVIEW_TOKEN_PATH } from "@/features/broadcasts/lib/api-paths"
import { IDEMPOTENCY_EXEMPT_READ_PATHS } from "@/lib/idempotency/constants"

describe("idempotency read exemption", () => {
  test("the audience preview is exempt, so a repeated key never replays stale rows", () => {
    expect(
      IDEMPOTENCY_EXEMPT_READ_PATHS.has(BROADCAST_AUDIENCE_PREVIEW_TOKEN_PATH),
    ).toBe(true)
  })

  test("a write route is never exempt", () => {
    expect(IDEMPOTENCY_EXEMPT_READ_PATHS.has("/v1/broadcasts")).toBe(false)
    expect(IDEMPOTENCY_EXEMPT_READ_PATHS.has("/v1/contacts/bulk/tags")).toBe(
      false,
    )
  })
})
