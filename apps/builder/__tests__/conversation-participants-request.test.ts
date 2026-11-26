import { describe, expect, test } from "vitest"
import {
  listConversationParticipantsPrivateRequest,
  listConversationParticipantsRequest,
} from "@/features/conversations/schema/public"

describe("listConversationParticipantsRequest", () => {
  test("accepts the snowflake-style conversation ids the app issues", () => {
    expect(
      listConversationParticipantsRequest.safeParse({
        id: "11754351170839993",
      }).success,
    ).toBe(true)
  })

  test.each([
    ["an id longer than a bigint column holds", "9223372036854775808"],
    ["an id that is not digits", "abc"],
    ["an empty id", ""],
  ])("rejects %s, so it never reaches a SQL compare", (_label, id) => {
    expect(listConversationParticipantsRequest.safeParse({ id }).success).toBe(
      false,
    )
  })
})

describe("listConversationParticipantsPrivateRequest", () => {
  const valid = { id: "11754351170839993", workspaceId: "11640681410281472" }

  test("accepts the ids the app issues", () => {
    expect(
      listConversationParticipantsPrivateRequest.safeParse(valid).success,
    ).toBe(true)
  })

  test.each([
    [
      "a workspace id longer than a bigint column holds",
      { workspaceId: "9223372036854775808" },
    ],
    [
      "a conversation id longer than a bigint column holds",
      { id: "9223372036854775808" },
    ],
    ["a missing workspace id", { workspaceId: undefined }],
  ])("rejects %s", (_label, override) => {
    expect(
      listConversationParticipantsPrivateRequest.safeParse({
        ...valid,
        ...override,
      }).success,
    ).toBe(false)
  })
})
