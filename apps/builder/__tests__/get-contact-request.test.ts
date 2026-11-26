import { describe, expect, test } from "vitest"
import { getContactRequest } from "@/features/contacts/schema/query"

describe("getContactRequest", () => {
  test("accepts the snowflake-style ids the app issues", () => {
    expect(
      getContactRequest.safeParse({
        workspaceId: "11640681410281472",
        contactId: "11731730122409244",
      }).success,
    ).toBe(true)
  })

  test.each([
    [
      "a contact id longer than a bigint column holds",
      "workspaceId",
      "11640681410281472",
      "contactId",
      "9223372036854775808",
    ],
    [
      "a workspace id longer than a bigint column holds",
      "contactId",
      "11731730122409244",
      "workspaceId",
      "9223372036854775808",
    ],
  ])("rejects %s, so it never reaches a SQL compare", (_label, okKey, okValue, badKey, badValue) => {
    expect(
      getContactRequest.safeParse({ [okKey]: okValue, [badKey]: badValue })
        .success,
    ).toBe(false)
  })

  test.each([
    ["abc"],
    [""],
    ["12.5"],
    ["-1"],
  ])("still rejects %j as a contact id", (contactId) => {
    expect(
      getContactRequest.safeParse({ workspaceId: "1", contactId }).success,
    ).toBe(false)
  })
})
