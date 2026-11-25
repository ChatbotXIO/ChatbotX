// @vitest-environment node

import { describe, expect, test } from "vitest"
import { readReconnectOutcome } from "@/features/social-accounts/lib/reconnect-result"

const params = (query: string) => new URLSearchParams(query)

describe("readReconnectOutcome", () => {
  test("is null when the page was not reached from a reconnect", () => {
    expect(readReconnectOutcome(params(""))).toBeNull()
    expect(readReconnectOutcome(params("reconnect=other"))).toBeNull()
  })

  test("reads success", () => {
    expect(readReconnectOutcome(params("reconnect=success"))).toEqual({
      ok: true,
    })
  })

  test("reads a known failure reason and falls back to failed", () => {
    expect(
      readReconnectOutcome(params("reconnect=error&reason=cancelled")),
    ).toEqual({ ok: false, reason: "cancelled" })
    expect(
      readReconnectOutcome(params("reconnect=error&reason=<script>")),
    ).toEqual({ ok: false, reason: "failed" })
  })
})
