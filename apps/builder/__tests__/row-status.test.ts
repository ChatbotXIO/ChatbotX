// @vitest-environment node
import { describe, expect, test } from "vitest"
import {
  isCoexistTarget,
  rowNote,
} from "@/features/channel-connect/lib/row-status"
import type { ConnectOutcome } from "@/features/channel-connect/schema"

function outcome(overrides: Partial<ConnectOutcome> = {}): ConnectOutcome {
  return {
    sourceId: "a",
    name: "A",
    status: "connected",
    coexistEligible: false,
    ...overrides,
  }
}

describe("rowNote", () => {
  test("returns undefined for an undefined outcome", () => {
    expect(rowNote(undefined)).toBeUndefined()
  })

  test("a warning takes priority over a reason and carries the warning tone", () => {
    expect(
      rowNote(outcome({ warning: "followUpFailed", reason: "unknown" })),
    ).toEqual({
      key: "channels.connectMany.reason.followUpFailed",
      tone: "warning",
    })
  })

  test("no warning falls back to the reason key with the muted tone", () => {
    expect(rowNote(outcome({ reason: "channelLimit" }))).toEqual({
      key: "channels.connectMany.reason.channelLimit",
      tone: "muted",
    })
  })

  test("alreadyConnected has no REASON_MESSAGE_KEYS entry, so no note renders", () => {
    expect(
      rowNote(outcome({ status: "duplicated", reason: "alreadyConnected" })),
    ).toBeUndefined()
  })

  test("no warning and no reason renders no note", () => {
    expect(rowNote(outcome())).toBeUndefined()
  })

  test("a provider rejection passes the provider's own sentence through as the note detail", () => {
    expect(
      rowNote(
        outcome({
          status: "failed",
          reason: "providerRejected",
          detail: "WhatsApp accounts cannot be used with this API.",
        }),
      ),
    ).toEqual({
      key: "channels.connectMany.reason.providerRejected",
      tone: "muted",
      detail: "WhatsApp accounts cannot be used with this API.",
    })
  })

  test("a reason without a detail carries none — the translated reason is the whole note", () => {
    expect(
      rowNote(outcome({ status: "failed", reason: "providerRejected" })),
    ).toEqual({
      key: "channels.connectMany.reason.providerRejected",
      tone: "muted",
    })
  })
})

describe("isCoexistTarget", () => {
  test("true only when connected, coexist-eligible, and integrationId is present", () => {
    expect(
      isCoexistTarget(
        outcome({ coexistEligible: true, integrationId: "int-1" }),
      ),
    ).toBe(true)
  })

  test("false when not connected", () => {
    expect(
      isCoexistTarget(
        outcome({
          status: "failed",
          reason: "unknown",
          coexistEligible: true,
          integrationId: "int-1",
        }),
      ),
    ).toBe(false)
  })

  test("false when not coexist-eligible", () => {
    expect(
      isCoexistTarget(
        outcome({ coexistEligible: false, integrationId: "int-1" }),
      ),
    ).toBe(false)
  })

  test("false when integrationId is missing", () => {
    expect(isCoexistTarget(outcome({ coexistEligible: true }))).toBe(false)
  })
})
