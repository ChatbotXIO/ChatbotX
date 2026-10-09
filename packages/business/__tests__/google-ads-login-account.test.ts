import { describe, expect, test } from "vitest"
import { resolveLoginAccountId } from "../src/google-ads/login-account"

const CLIENT = "1112223333"
const MANAGER = "4445556666"
const OWNER = "7778889999"

describe("resolveLoginAccountId", () => {
  test("same account, reached directly: the account itself", () => {
    expect(
      resolveLoginAccountId({
        customerId: CLIENT,
        loginCustomerId: null,
        conversionCustomerId: CLIENT,
      }),
    ).toBe(CLIENT)
  })

  test("same account, reached through a manager: the manager", () => {
    expect(
      resolveLoginAccountId({
        customerId: CLIENT,
        loginCustomerId: MANAGER,
        conversionCustomerId: CLIENT,
      }),
    ).toBe(MANAGER)
  })

  test("cross-account, reached directly: sign in as the account owning the actions", () => {
    expect(
      resolveLoginAccountId({
        customerId: CLIENT,
        loginCustomerId: null,
        conversionCustomerId: OWNER,
      }),
    ).toBe(OWNER)
  })

  test("cross-account, reached through a manager: the same manager route", () => {
    expect(
      resolveLoginAccountId({
        customerId: CLIENT,
        loginCustomerId: MANAGER,
        conversionCustomerId: OWNER,
      }),
    ).toBe(MANAGER)
  })
})
