import { describe, expect, test } from "vitest"
import { getCapiConnectionState } from "@/features/meta-conversions/lib/capi-connection-state"

describe("getCapiConnectionState", () => {
  test("user disconnect overrides everything", () => {
    expect(
      getCapiConnectionState({
        capiDisconnected: true,
        hasManualCapiAccessToken: true,
        hasCapiScope: true,
        hasDatasetId: true,
      }),
    ).toBe("disconnected")
  })

  test("manual token wins over oauth", () => {
    expect(
      getCapiConnectionState({
        capiDisconnected: false,
        hasManualCapiAccessToken: true,
        hasCapiScope: true,
        hasDatasetId: true,
      }),
    ).toBe("connectedCustom")
  })

  test("manual token without dataset stays disconnected", () => {
    expect(
      getCapiConnectionState({
        capiDisconnected: false,
        hasManualCapiAccessToken: true,
        hasCapiScope: false,
        hasDatasetId: false,
      }),
    ).toBe("disconnected")
  })

  test("oauth requires both scope and dataset", () => {
    expect(
      getCapiConnectionState({
        capiDisconnected: false,
        hasManualCapiAccessToken: false,
        hasCapiScope: true,
        hasDatasetId: true,
      }),
    ).toBe("connectedOauth")
  })

  test("scope granted but no dataset stays disconnected (chooser owns the dataset step)", () => {
    expect(
      getCapiConnectionState({
        capiDisconnected: false,
        hasManualCapiAccessToken: false,
        hasCapiScope: true,
        hasDatasetId: false,
      }),
    ).toBe("disconnected")
  })

  test("user disconnect still overrides scope-only state", () => {
    expect(
      getCapiConnectionState({
        capiDisconnected: true,
        hasManualCapiAccessToken: false,
        hasCapiScope: true,
        hasDatasetId: false,
      }),
    ).toBe("disconnected")
  })

  test("nothing configured is disconnected", () => {
    expect(
      getCapiConnectionState({
        capiDisconnected: false,
        hasManualCapiAccessToken: false,
        hasCapiScope: false,
        hasDatasetId: false,
      }),
    ).toBe("disconnected")
  })
})
