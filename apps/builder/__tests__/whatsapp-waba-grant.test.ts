// @vitest-environment node

import { describe, expect, test } from "vitest"
import {
  requireGrantedWabaId,
  resolveGrantedWabaId,
  WABA_GRANT_FAILURES,
} from "../src/features/integration-whatsapp/libs/waba-grant"

const errorMessages = {
  none: "no waba granted",
  mismatch: "waba mismatch",
}

describe("resolveGrantedWabaId", () => {
  test("uses the requested WABA when the token grants it, regardless of position", () => {
    expect(
      resolveGrantedWabaId({
        grantedWabaIds: ["waba-9", "waba-1", "waba-5"],
        requestedWabaId: "waba-1",
      }),
    ).toEqual({ wabaId: "waba-1" })
  })

  test("falls back to the first grant only when nothing was requested", () => {
    expect(
      resolveGrantedWabaId({ grantedWabaIds: ["waba-9", "waba-1"] }),
    ).toEqual({ wabaId: "waba-9" })
    expect(
      resolveGrantedWabaId({
        grantedWabaIds: ["waba-9", "waba-1"],
        requestedWabaId: null,
      }),
    ).toEqual({ wabaId: "waba-9" })
  })

  test("reports a mismatch when the requested WABA is not granted", () => {
    expect(
      resolveGrantedWabaId({
        grantedWabaIds: ["waba-9"],
        requestedWabaId: "waba-1",
      }),
    ).toEqual({ failure: WABA_GRANT_FAILURES.MISMATCH })
  })

  test("reports no grant when the token carries no WABA, even if one was requested", () => {
    expect(
      resolveGrantedWabaId({ grantedWabaIds: [], requestedWabaId: "waba-1" }),
    ).toEqual({ failure: WABA_GRANT_FAILURES.NONE })
    expect(resolveGrantedWabaId({ grantedWabaIds: [] })).toEqual({
      failure: WABA_GRANT_FAILURES.NONE,
    })
  })
})

describe("requireGrantedWabaId", () => {
  test("returns the resolved WABA id", () => {
    expect(
      requireGrantedWabaId({
        grantedWabaIds: ["waba-9", "waba-1"],
        requestedWabaId: "waba-1",
        errorMessages,
      }),
    ).toBe("waba-1")
  })

  test("throws the caller's message for each failure", () => {
    expect(() =>
      requireGrantedWabaId({
        grantedWabaIds: [],
        requestedWabaId: "waba-1",
        errorMessages,
      }),
    ).toThrow(errorMessages.none)
    expect(() =>
      requireGrantedWabaId({
        grantedWabaIds: ["waba-9"],
        requestedWabaId: "waba-1",
        errorMessages,
      }),
    ).toThrow(errorMessages.mismatch)
  })
})
