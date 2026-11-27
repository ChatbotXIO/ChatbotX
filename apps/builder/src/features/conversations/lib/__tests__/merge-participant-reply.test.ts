import type { InfiniteData } from "@tanstack/react-query"
import { describe, expect, test } from "vitest"
import type {
  ConversationParticipantResource,
  ListConversationParticipantsResponse,
} from "../../schema/resource"
import {
  mergeParticipantReply,
  mergeParticipantReplyIntoPages,
} from "../merge-participant-reply"

const at = (minute: number) => new Date(Date.UTC(2026, 10, 20, 10, minute))
const member = (
  userId: string,
  minute: number,
): ConversationParticipantResource => ({
  userId,
  name: `Name ${userId}`,
  image: null,
  lastRepliedAt: at(minute),
})

describe("mergeParticipantReply", () => {
  test("a new member goes to the top, newest first", () => {
    const list = [member("1", 20), member("2", 10)]

    expect(
      mergeParticipantReply(list, member("3", 30)).map((p) => p.userId),
    ).toEqual(["3", "1", "2"])
  })

  test("a newer reply moves an existing member to the top without duplicating them", () => {
    const list = [member("1", 20), member("2", 10)]

    const merged = mergeParticipantReply(list, member("2", 40))

    expect(merged.map((p) => p.userId)).toEqual(["2", "1"])
    expect(merged[0]?.lastRepliedAt).toEqual(at(40))
  })

  test("a duplicate or older reply returns the same list reference", () => {
    const list = [member("1", 20), member("2", 10)]

    expect(mergeParticipantReply(list, member("1", 20))).toBe(list)
    expect(mergeParticipantReply(list, member("1", 5))).toBe(list)
  })

  test("the order of arrival does not change the result", () => {
    const replies = [member("1", 10), member("2", 20), member("1", 30)]
    const forward = replies.reduce<readonly ConversationParticipantResource[]>(
      (list, reply) => mergeParticipantReply(list, reply),
      [],
    )
    const backward = [...replies]
      .reverse()
      .reduce<readonly ConversationParticipantResource[]>(
        (list, reply) => mergeParticipantReply(list, reply),
        [],
      )

    expect(forward).toEqual(backward)
  })

  test("a tie on time is ordered by user id, like the server", () => {
    const merged = mergeParticipantReply([member("1", 10)], member("2", 10))

    expect(merged.map((p) => p.userId)).toEqual(["2", "1"])
  })

  test("caps a preview and keeps the newest", () => {
    const list = [member("1", 30), member("2", 20), member("3", 10)]

    expect(
      mergeParticipantReply(list, member("4", 40), 3).map((p) => p.userId),
    ).toEqual(["4", "1", "2"])
  })

  test("starts a list from nothing", () => {
    expect(mergeParticipantReply([], member("1", 10))).toEqual([
      member("1", 10),
    ])
  })
})

describe("mergeParticipantReplyIntoPages", () => {
  const pages = (): InfiniteData<
    ListConversationParticipantsResponse,
    string | undefined
  > => ({
    pageParams: [undefined, "cursor-1"],
    pages: [
      { data: [member("1", 30), member("2", 20)], nextCursor: "cursor-1" },
      { data: [member("3", 10)], nextCursor: null },
    ],
  })

  test("moves a member from a later page to the top of the first", () => {
    const merged = mergeParticipantReplyIntoPages(pages(), member("3", 50))

    expect(merged.pages[0]?.data.map((p) => p.userId)).toEqual(["3", "1", "2"])
    expect(merged.pages[1]?.data).toEqual([])
    expect(merged.pageParams).toEqual([undefined, "cursor-1"])
  })

  test("a duplicate or older reply returns the same cache entry", () => {
    const data = pages()

    expect(mergeParticipantReplyIntoPages(data, member("1", 30))).toBe(data)
    expect(mergeParticipantReplyIntoPages(data, member("2", 1))).toBe(data)
  })

  test("a stale event does not move back a member whose newer reply is on a later page", () => {
    const data = pages()

    const merged = mergeParticipantReplyIntoPages(data, member("3", 5))

    expect(merged).toBe(data)
    expect(merged.pages[1]?.data.map((p) => p.userId)).toEqual(["3"])
  })

  test("an empty cache entry is left alone", () => {
    const empty = { pages: [], pageParams: [] }

    expect(mergeParticipantReplyIntoPages(empty, member("1", 10))).toBe(empty)
  })
})
