import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  findWorkspace: vi.fn(),
}))

vi.mock("../src/workspace/service", () => ({
  workspaceService: { findById: mocks.findWorkspace },
}))

const {
  applyEffectiveCurrency,
  resolveWorkspaceCurrency,
  resolveWorkspaceDefault,
  withEffectiveCurrencies,
  withEffectiveCurrency,
} = await import("../src/pipeline/currency")

const workspaceIn = (targetCountry: string | null) =>
  mocks.findWorkspace.mockResolvedValue({ id: "ws-1", targetCountry })

beforeEach(() => {
  vi.resetAllMocks()
})

describe("resolveWorkspaceCurrency", () => {
  test("follows the target country", async () => {
    workspaceIn("VN")
    expect(await resolveWorkspaceCurrency("ws-1")).toBe("VND")
  })

  test.each([
    ["no country", null],
    ["an unknown country", "unknown"],
    ["a country without a currency", "AQ"],
  ])("is USD for %s, whatever the store uses", async (_label, country) => {
    workspaceIn(country)
    expect(await resolveWorkspaceCurrency("ws-1")).toBe("USD")
  })
})

describe("resolveWorkspaceDefault", () => {
  test("names the country the currency comes from, upper-cased", async () => {
    workspaceIn(" vn ")
    expect(await resolveWorkspaceDefault("ws-1")).toEqual({
      currency: "VND",
      country: "VN",
    })
  })

  test.each([
    ["no country", null],
    ["an unknown country", "unknown"],
    ["a country without a currency", "AQ"],
  ])("names no country for %s and falls back to USD", async (_label, country) => {
    workspaceIn(country)
    expect(await resolveWorkspaceDefault("ws-1")).toEqual({
      currency: "USD",
      country: null,
    })
  })
})

describe("applyEffectiveCurrency", () => {
  test("an override wins over the workspace currency", () => {
    expect(applyEffectiveCurrency({ currency: "JPY" }, "VND")).toEqual({
      currency: "JPY",
      currencyOverride: "JPY",
    })
  })

  test("no override takes the workspace currency", () => {
    expect(applyEffectiveCurrency({ currency: null }, "VND")).toEqual({
      currency: "VND",
      currencyOverride: null,
    })
  })
})

describe("withEffectiveCurrency", () => {
  test("an override never reads the workspace", async () => {
    expect(
      await withEffectiveCurrency("ws-1", { id: "p-1", currency: "JPY" }),
    ).toEqual({ id: "p-1", currency: "JPY", currencyOverride: "JPY" })
    expect(mocks.findWorkspace).not.toHaveBeenCalled()
  })

  test("exposes the effective currency and keeps the stored one as the override", async () => {
    workspaceIn("VN")
    expect(
      await withEffectiveCurrency("ws-1", { id: "p-1", currency: null }),
    ).toEqual({ id: "p-1", currency: "VND", currencyOverride: null })
    expect(
      await withEffectiveCurrency("ws-1", { id: "p-2", currency: "USD" }),
    ).toEqual({ id: "p-2", currency: "USD", currencyOverride: "USD" })
  })
})

describe("withEffectiveCurrencies", () => {
  test("reads the workspace once for many following rows", async () => {
    workspaceIn("VN")
    const rows = await withEffectiveCurrencies("ws-1", [
      { id: "a", currency: null },
      { id: "b", currency: "USD" },
      { id: "c", currency: null },
    ])
    expect(rows.map((row) => row.currency)).toEqual(["VND", "USD", "VND"])
    expect(rows.map((row) => row.currencyOverride)).toEqual([null, "USD", null])
    expect(mocks.findWorkspace).toHaveBeenCalledTimes(1)
  })

  test("never reads the workspace when every row has an override", async () => {
    const rows = await withEffectiveCurrencies("ws-1", [
      { id: "a", currency: "USD" },
      { id: "b", currency: "JPY" },
    ])
    expect(rows.map((row) => row.currency)).toEqual(["USD", "JPY"])
    expect(mocks.findWorkspace).not.toHaveBeenCalled()
  })

  test("an empty list reads nothing", async () => {
    expect(await withEffectiveCurrencies("ws-1", [])).toEqual([])
    expect(mocks.findWorkspace).not.toHaveBeenCalled()
  })
})
