import { describe, expect, test } from "vitest"
import {
  connectionAuthorizationPhases,
  userConnectionAuthorizationAad,
  userConnectionAuthorizationSchema,
} from "../src/partials/connection"

describe("userConnectionAuthorizationAad", () => {
  // Stored ciphertext is bound to this exact string.
  test("binds the user and the provider", () => {
    expect(userConnectionAuthorizationAad("123", "messenger")).toBe(
      "user:123:connection-authorization:messenger",
    )
  })

  test("differs per user and per provider", () => {
    expect(userConnectionAuthorizationAad("1", "messenger")).not.toBe(
      userConnectionAuthorizationAad("2", "messenger"),
    )
    expect(userConnectionAuthorizationAad("1", "messenger")).not.toBe(
      userConnectionAuthorizationAad("1", "instagram"),
    )
  })
})

describe("userConnectionAuthorizationSchema", () => {
  const entry = {
    encryptedAuth: { v: 1, iv: "aa", text: "bb", tag: "cc" },
    phase: "authorizationObtained",
    purpose: null,
    workspaceId: "w1",
    connectSessionId: null,
    candidateCount: null,
    unavailableCandidateCount: null,
    connectSessionErrorCode: null,
    capturedAt: "2026-11-18T10:00:00.000Z",
  }

  test("accepts every phase", () => {
    for (const phase of connectionAuthorizationPhases.options) {
      expect(
        userConnectionAuthorizationSchema.safeParse({ ...entry, phase })
          .success,
      ).toBe(true)
    }
  })

  test("accepts a null workspaceId", () => {
    expect(
      userConnectionAuthorizationSchema.safeParse({
        ...entry,
        workspaceId: null,
      }).success,
    ).toBe(true)
  })

  test("rejects an unknown phase and a non-ISO capturedAt", () => {
    expect(
      userConnectionAuthorizationSchema.safeParse({ ...entry, phase: "x" })
        .success,
    ).toBe(false)
    expect(
      userConnectionAuthorizationSchema.safeParse({
        ...entry,
        capturedAt: "yesterday",
      }).success,
    ).toBe(false)
  })
})
