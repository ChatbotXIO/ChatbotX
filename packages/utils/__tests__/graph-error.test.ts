import { describe, expect, it } from "vitest"
import { formatGraphErrorMessage } from "../src/graph-error"

describe("formatGraphErrorMessage", () => {
  it("keeps the code, the subcode, and both sentences", () => {
    // The reported Messenger failure, verbatim.
    expect(
      formatGraphErrorMessage({
        code: 10,
        subCode: 1_893_063,
        message: "Application does not have permission for this action",
        userMessage:
          "Bạn tạm thời bị hạn chế gửi tin nhắn. Tìm hiểu thêm về thời gian và lý do chúng tôi hạn chế khả năng nhắn tin.",
      }),
    ).toBe(
      "#(10 - 1893063) Application does not have permission for this action. Bạn tạm thời bị hạn chế gửi tin nhắn. Tìm hiểu thêm về thời gian và lý do chúng tôi hạn chế khả năng nhắn tin.",
    )
  })

  it("prints the code alone when Meta sent no subcode", () => {
    expect(
      formatGraphErrorMessage({
        code: 190,
        message: "Access token expired",
      }),
    ).toBe("#(190) Access token expired")
  })

  it("writes no prefix at all when there is no code", () => {
    expect(formatGraphErrorMessage({ message: "boom" })).toBe("boom")
  })

  it("treats the -1 unknown sentinel as no code, never as #(-1)", () => {
    expect(
      formatGraphErrorMessage({ code: -1, subCode: -1, message: "boom" }),
    ).toBe("boom")
  })

  it("ignores our own placeholder codes, which identify nothing", () => {
    expect(
      formatGraphErrorMessage({
        code: "messengerError",
        message: "Messenger API call failed",
      }),
    ).toBe("Messenger API call failed")
  })

  it("reads a numeric subcode sent as a string", () => {
    expect(
      formatGraphErrorMessage({ code: 100, subCode: "33", message: "boom" }),
    ).toBe("#(100 - 33) boom")
  })

  it("prints a repeated sentence only once", () => {
    expect(
      formatGraphErrorMessage({
        message: "Token expired",
        userMessage: "Token expired",
      }),
    ).toBe("Token expired")
  })

  it("does not add a second period to a message that already ends in one", () => {
    expect(
      formatGraphErrorMessage({
        code: 4,
        message: "Rate limit reached.",
        userMessage: "Try again later.",
      }),
    ).toBe("#(4) Rate limit reached. Try again later.")
  })

  it("uses whichever sentence Meta sent when only one is present", () => {
    expect(
      formatGraphErrorMessage({ code: 10, userMessage: "Bạn bị hạn chế" }),
    ).toBe("#(10) Bạn bị hạn chế")
  })

  it("does not repeat the code Meta already put in front of its own message", () => {
    expect(
      formatGraphErrorMessage({
        code: 100,
        subCode: 2_018_001,
        message: "(#100) Param recipient[id] must be a valid ID string",
      }),
    ).toBe("#(100 - 2018001) Param recipient[id] must be a valid ID string")
  })

  it("keeps a bracketed code that belongs to some other failure", () => {
    expect(
      formatGraphErrorMessage({
        code: 100,
        message: "(#190) Access token expired",
      }),
    ).toBe("#(100) (#190) Access token expired")
  })

  it("falls back to the caller's text when the code prefix was the whole message", () => {
    expect(
      formatGraphErrorMessage({ code: 100, message: "(#100)" }),
    ).toBeUndefined()
  })

  it("returns undefined when the body carried no text, so callers can fall back", () => {
    expect(formatGraphErrorMessage({ code: 10 })).toBeUndefined()
    expect(formatGraphErrorMessage({ message: "   " })).toBeUndefined()
    expect(formatGraphErrorMessage({})).toBeUndefined()
  })
})
