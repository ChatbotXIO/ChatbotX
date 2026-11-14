import { describe, expect, test } from "vitest"
import { CONTACT_SCAN_ERRORS } from "../src/contact-scan/constants"
import { resolveContactScanRunStatus } from "../src/contact-scan/run-status"

describe("resolveContactScanRunStatus", () => {
  test("a partial run with the cancel sentinel is cancelled", () => {
    expect(
      resolveContactScanRunStatus({
        status: "partial",
        currentError: CONTACT_SCAN_ERRORS.cancelled,
      }),
    ).toBe("cancelled")
  })

  test("a partial run for any other reason stays partial", () => {
    expect(
      resolveContactScanRunStatus({
        status: "partial",
        currentError: CONTACT_SCAN_ERRORS.scanLimitReached,
      }),
    ).toBe("partial")
    expect(
      resolveContactScanRunStatus({ status: "partial", currentError: null }),
    ).toBe("partial")
  })

  test("the sentinel on a non-partial status does not make it cancelled", () => {
    expect(
      resolveContactScanRunStatus({
        status: "failed",
        currentError: CONTACT_SCAN_ERRORS.cancelled,
      }),
    ).toBe("failed")
  })

  test.each([
    "init",
    "running",
    "succeeded",
    "failed",
  ] as const)("%s passes through", (status) => {
    expect(resolveContactScanRunStatus({ status, currentError: null })).toBe(
      status,
    )
  })

  test("waiting (never set on a scan) is treated as running", () => {
    expect(
      resolveContactScanRunStatus({ status: "waiting", currentError: null }),
    ).toBe("running")
  })
})
