import { describe, expect, test } from "vitest"
import {
  resolveMessageAuthorUserId,
  SENT_BY_USER_ID_KEY,
  sentByUserAttributes,
} from "../src/partials/message"

describe("resolveMessageAuthorUserId", () => {
  test("a typed member message is authored by its senderId", () => {
    expect(
      resolveMessageAuthorUserId({
        senderType: "user",
        senderId: "user-1",
        contentAttributes: { [SENT_BY_USER_ID_KEY]: "other" },
      }),
    ).toBe("user-1")
  })

  test("a page echo without a ChatbotX member has no author", () => {
    expect(
      resolveMessageAuthorUserId({
        senderType: "user",
        senderId: null,
        contentAttributes: null,
      }),
    ).toBeNull()
  })

  test("a bot row stamped with a member is authored by that member", () => {
    expect(
      resolveMessageAuthorUserId({
        senderType: "bot",
        senderId: null,
        contentAttributes: { [SENT_BY_USER_ID_KEY]: "user-2" },
      }),
    ).toBe("user-2")
  })

  test.each([
    "bot",
    "contact",
    "system",
    "api",
  ] as const)("an unstamped %s row has no author", (senderType) => {
    expect(
      resolveMessageAuthorUserId({
        senderType,
        senderId: "x",
        contentAttributes: {},
      }),
    ).toBeNull()
  })

  test.each([
    null,
    "text",
    42,
    { [SENT_BY_USER_ID_KEY]: 42 },
    { [SENT_BY_USER_ID_KEY]: null },
  ])("malformed contentAttributes %j yields no author", (contentAttributes) => {
    expect(
      resolveMessageAuthorUserId({
        senderType: "bot",
        senderId: null,
        contentAttributes,
      }),
    ).toBeNull()
  })
})

describe("sentByUserAttributes", () => {
  test("stamps a member id and nothing otherwise", () => {
    expect(sentByUserAttributes("user-1")).toEqual({
      [SENT_BY_USER_ID_KEY]: "user-1",
    })
    expect(sentByUserAttributes(undefined)).toEqual({})
    expect(sentByUserAttributes(null)).toEqual({})
    expect(sentByUserAttributes("")).toEqual({})
  })
})
