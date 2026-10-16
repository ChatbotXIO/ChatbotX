import { describe, expect, test } from "vitest"
import {
  isAccountChoiceMissing,
  keepTargetsOfAccount,
} from "../lib/account-choice"

describe("isAccountChoiceMissing", () => {
  test("requires a choice on a new automation when several accounts exist", () => {
    expect(
      isAccountChoiceMissing({
        inboxId: undefined,
        accountCount: 2,
        isLoading: false,
      }),
    ).toBe(true)
  })

  test("blocks saving while the accounts are still loading", () => {
    expect(
      isAccountChoiceMissing({
        inboxId: undefined,
        accountCount: 0,
        isLoading: true,
      }),
    ).toBe(true)
  })

  test("needs no choice with zero or one account", () => {
    for (const accountCount of [0, 1]) {
      expect(
        isAccountChoiceMissing({
          inboxId: undefined,
          accountCount,
          isLoading: false,
        }),
      ).toBe(false)
    }
  })

  test("a deliberate 'every account' (null) or an account counts as chosen", () => {
    for (const inboxId of [null, "inbox-a"]) {
      expect(
        isAccountChoiceMissing({ inboxId, accountCount: 3, isLoading: true }),
      ).toBe(false)
    }
  })
})

describe("keepTargetsOfAccount", () => {
  const owners: Record<string, string> = { p1: "inbox-a", p2: "inbox-b" }
  const findOwner = (id: string) => owners[id]

  test("keeps the posts of the chosen account and drops another account's", () => {
    expect(keepTargetsOfAccount(["p1", "p2"], "inbox-a", findOwner)).toEqual([
      "p1",
    ])
  })

  test("drops posts whose account is unknown rather than risk a silent automation", () => {
    expect(
      keepTargetsOfAccount(["p1", "typed-by-hand"], "inbox-a", findOwner),
    ).toEqual(["p1"])
  })

  test("drops everything when the channel cannot tell a post's account", () => {
    expect(keepTargetsOfAccount(["p1", "p2"], "inbox-a")).toEqual([])
  })
})
