import { describe, expect, test } from "vitest"
import { filterAdAccountsByIds } from "../src/integration-facebook-ads/selection"

describe("filterAdAccountsByIds", () => {
  const accounts = [
    { id: "act_1", name: "One" },
    { id: "act_2", name: "Two" },
    { id: "act_3", name: "Three" },
  ]

  test("returns all accounts when selection is null", () => {
    expect(filterAdAccountsByIds(accounts, null)).toEqual(accounts)
  })

  test("returns all accounts when selection is empty", () => {
    expect(filterAdAccountsByIds(accounts, [])).toEqual(accounts)
  })

  test("returns the selected account intersection", () => {
    expect(filterAdAccountsByIds(accounts, ["act_1", "act_3"])).toEqual([
      accounts[0],
      accounts[2],
    ])
  })

  test("drops stale selected ids that are not in the live account list", () => {
    expect(filterAdAccountsByIds(accounts, ["act_2", "act_stale"])).toEqual([
      accounts[1],
    ])
  })
})
