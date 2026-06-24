import { describe, expect, test } from "vitest"
import { resolveMacReconcileAction } from "../src/schedule/handlers/sync-user-quota"

const P1 = "2026-06-01T00:00:00.000Z"
const P2 = "2026-07-01T00:00:00.000Z"

describe("resolveMacReconcileAction", () => {
  test("is a no-op when nothing is tracked or stored", () => {
    expect(resolveMacReconcileAction(null, null, 0, P1)).toEqual({
      setLiveMac: null,
      stampPeriod: false,
      persistMacUsed: null,
    })
  })

  test("resets the live counter when the billing cycle rolled over", () => {
    // Private quota-worker advanced periodStart and zeroed macUsed (recurring).
    expect(resolveMacReconcileAction("40", P1, 0, P2)).toEqual({
      setLiveMac: 0,
      stampPeriod: true,
      persistMacUsed: null,
    })
  })

  test("does not reset a lifetime plan (period stamp never changes)", () => {
    // Lifetime: periodStart is stable, so the stamp always equals the DB period.
    expect(resolveMacReconcileAction("40", P1, 40, P1)).toEqual({
      setLiveMac: null,
      stampPeriod: false,
      persistMacUsed: null,
    })
  })

  test("treats an empty period (no plan period) as stable — never resets", () => {
    expect(resolveMacReconcileAction("40", "", 40, "")).toEqual({
      setLiveMac: null,
      stampPeriod: false,
      persistMacUsed: null,
    })
  })

  test("snapshots the live count into the DB within the same period", () => {
    expect(resolveMacReconcileAction("55", P1, 40, P1)).toEqual({
      setLiveMac: null,
      stampPeriod: false,
      persistMacUsed: 55,
    })
  })

  test("adopts and stamps an unstamped live counter without wiping it", () => {
    // HINCRBY from mac-tracking creates `mac` without a period stamp.
    expect(resolveMacReconcileAction("12", null, 0, P1)).toEqual({
      setLiveMac: null,
      stampPeriod: true,
      persistMacUsed: 12,
    })
  })

  test("seeds the DB value when the live counter is absent but DB has usage", () => {
    expect(resolveMacReconcileAction(null, P1, 30, P1)).toEqual({
      setLiveMac: null,
      stampPeriod: false,
      persistMacUsed: null,
    })
  })
})
