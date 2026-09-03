import { describe, expect, test } from "vitest"
import { getCapiStatus } from "@/features/meta-conversions/lib/capi-status"

describe("getCapiStatus", () => {
  test("unsupported wins over every other input", () => {
    expect(
      getCapiStatus({
        hasCapiScope: true,
        hasManualCapiAccessToken: true,
        hasDatasetId: true,
        credentialAvailable: true,
        supported: false,
      }),
    ).toBe("unsupported")
  })

  test("manual token with dataset is ready", () => {
    expect(
      getCapiStatus({
        hasCapiScope: false,
        hasManualCapiAccessToken: true,
        hasDatasetId: true,
        credentialAvailable: true,
      }),
    ).toBe("ready")
  })

  test("oauth scope with dataset is ready", () => {
    expect(
      getCapiStatus({
        hasCapiScope: true,
        hasManualCapiAccessToken: false,
        hasDatasetId: true,
        credentialAvailable: true,
      }),
    ).toBe("ready")
  })

  test("credential unavailable is unverified even with a dataset saved", () => {
    expect(
      getCapiStatus({
        hasCapiScope: false,
        hasManualCapiAccessToken: false,
        hasDatasetId: true,
        credentialAvailable: false,
      }),
    ).toBe("unverified")
  })

  test("dataset saved, scope missing, no manual token, credential available is missingPermission", () => {
    expect(
      getCapiStatus({
        hasCapiScope: false,
        hasManualCapiAccessToken: false,
        hasDatasetId: true,
        credentialAvailable: true,
      }),
    ).toBe("missingPermission")
  })

  test("nothing configured with credential available is notConnected", () => {
    expect(
      getCapiStatus({
        hasCapiScope: false,
        hasManualCapiAccessToken: false,
        hasDatasetId: false,
        credentialAvailable: true,
      }),
    ).toBe("notConnected")
  })

  test("user disconnect wins even with a dataset and scope", () => {
    expect(
      getCapiStatus({
        hasCapiScope: true,
        hasManualCapiAccessToken: false,
        hasDatasetId: true,
        credentialAvailable: true,
        capiDisconnected: true,
      }),
    ).toBe("notConnected")
  })

  test("user disconnect wins even with a manual token and dataset", () => {
    expect(
      getCapiStatus({
        hasCapiScope: false,
        hasManualCapiAccessToken: true,
        hasDatasetId: true,
        credentialAvailable: true,
        capiDisconnected: true,
      }),
    ).toBe("notConnected")
  })

  test("user disconnect with a saved dataset is notConnected, not missingPermission", () => {
    expect(
      getCapiStatus({
        hasCapiScope: false,
        hasManualCapiAccessToken: false,
        hasDatasetId: true,
        credentialAvailable: true,
        capiDisconnected: true,
      }),
    ).toBe("notConnected")
  })
})
