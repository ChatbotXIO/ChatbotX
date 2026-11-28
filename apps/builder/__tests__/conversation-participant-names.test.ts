// @vitest-environment node

import { describe, expect, test } from "vitest"
import { summarizeParticipantNames } from "@/features/conversations/lib/participant-names"

describe("summarizeParticipantNames", () => {
  test("names everyone and shows no overflow for up to 3 participants", () => {
    expect(summarizeParticipantNames(0, false)).toEqual({
      overflowLabel: "",
      shownCount: 0,
    })
    expect(summarizeParticipantNames(2, false)).toEqual({
      overflowLabel: "",
      shownCount: 2,
    })
    expect(summarizeParticipantNames(3, false)).toEqual({
      overflowLabel: "",
      shownCount: 3,
    })
  })

  test("shows 3 names then +N for the rest of what is loaded", () => {
    expect(summarizeParticipantNames(4, false)).toEqual({
      overflowLabel: "1",
      shownCount: 3,
    })
    expect(summarizeParticipantNames(10, false)).toEqual({
      overflowLabel: "7",
      shownCount: 3,
    })
  })

  test("adds a trailing + while another page exists", () => {
    expect(summarizeParticipantNames(10, true)).toEqual({
      overflowLabel: "7+",
      shownCount: 3,
    })
  })

  test("shows a bare + when exactly 3 are loaded and more exist", () => {
    expect(summarizeParticipantNames(3, true)).toEqual({
      overflowLabel: "+",
      shownCount: 3,
    })
  })
})
