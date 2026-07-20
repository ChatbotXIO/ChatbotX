import { ReplyFormat } from "@chatbotx.io/flow-config"
import { describe, expect, test } from "vitest"
import {
  accepted,
  firstAccepted,
  fromAttachment,
  fromLocation,
  type ReplyInputMessage,
  type ReplyValidator,
  rejected,
  replyFormatValidators,
  validateReplyInput,
} from "../src/get-user-data"

function makeMessage(
  overrides: Partial<ReplyInputMessage> = {},
): ReplyInputMessage {
  return {
    text: null,
    contentType: "text",
    contentAttributes: null,
    attachments: [],
    ...overrides,
  }
}

describe("replyFormatValidators", () => {
  test("defines a validator for every reply format", () => {
    for (const replyFormat of Object.values(ReplyFormat)) {
      expect(replyFormatValidators[replyFormat]).toBeTypeOf("function")
    }
  })

  test("accepts and rejects number text", () => {
    expect(
      validateReplyInput(ReplyFormat.number, makeMessage({ text: "42.5" })),
    ).toEqual(accepted("42.5"))
    expect(
      validateReplyInput(ReplyFormat.number, makeMessage({ text: "abc" })),
    ).toEqual(rejected("getUserData: invalid number"))
  })

  test("accepts and rejects email text", () => {
    expect(
      validateReplyInput(
        ReplyFormat.email,
        makeMessage({ text: "user@example.com" }),
      ),
    ).toEqual(accepted("user@example.com"))
    expect(
      validateReplyInput(ReplyFormat.email, makeMessage({ text: "invalid" })),
    ).toEqual(rejected("getUserData: invalid email address"))
  })

  test("accepts and rejects phone text", () => {
    expect(
      validateReplyInput(
        ReplyFormat.phone,
        makeMessage({ text: "+1-555-123-4567" }),
      ),
    ).toEqual(accepted("+1-555-123-4567"))
    expect(
      validateReplyInput(ReplyFormat.phone, makeMessage({ text: "hello" })),
    ).toEqual(rejected("getUserData: invalid phone number"))
  })

  test("accepts and rejects link text", () => {
    expect(
      validateReplyInput(
        ReplyFormat.link,
        makeMessage({ text: "https://example.com/a" }),
      ),
    ).toEqual(accepted("https://example.com/a"))
    expect(
      validateReplyInput(ReplyFormat.link, makeMessage({ text: "not-a-url" })),
    ).toEqual(rejected("getUserData: invalid link"))
  })

  test("accepts date and datetime text as ISO strings", () => {
    expect(
      validateReplyInput(ReplyFormat.date, makeMessage({ text: "2026-07-20" })),
    ).toEqual(accepted(new Date("2026-07-20").toISOString()))
    expect(
      validateReplyInput(
        ReplyFormat.datetime,
        makeMessage({ text: "2026-07-20T10:00:00.000Z" }),
      ),
    ).toEqual(accepted("2026-07-20T10:00:00.000Z"))
  })

  test("rejects invalid date and datetime text", () => {
    expect(
      validateReplyInput(ReplyFormat.date, makeMessage({ text: "never" })),
    ).toEqual(rejected("getUserData: invalid date"))
    expect(
      validateReplyInput(ReplyFormat.datetime, makeMessage({ text: "never" })),
    ).toEqual(rejected("getUserData: invalid date"))
  })

  test("accepts text and location formats as text passthrough", () => {
    expect(
      validateReplyInput(ReplyFormat.text, makeMessage({ text: "hello" })),
    ).toEqual(accepted("hello"))
    expect(
      validateReplyInput(ReplyFormat.location, makeMessage({ text: "Hanoi" })),
    ).toEqual(accepted("Hanoi"))
  })

  test("rejects attachment messages for text-based formats", () => {
    const textBasedFormats = [
      ReplyFormat.number,
      ReplyFormat.text,
      ReplyFormat.email,
      ReplyFormat.phone,
      ReplyFormat.link,
      ReplyFormat.location,
      ReplyFormat.date,
      ReplyFormat.datetime,
    ]

    for (const replyFormat of textBasedFormats) {
      expect(
        validateReplyInput(
          replyFormat,
          makeMessage({
            text: "user@example.com",
            attachments: [{ fileType: "image", originPath: "/image.jpg" }],
          }),
        ),
      ).toEqual(rejected("getUserData: unsupported file type"))
    }
  })

  test("rejects missing text for text and location formats", () => {
    expect(validateReplyInput(ReplyFormat.text, makeMessage())).toEqual(
      rejected("getUserData: expected text input"),
    )
    expect(validateReplyInput(ReplyFormat.location, makeMessage())).toEqual(
      rejected("getUserData: expected text input"),
    )
  })

  test("accepts image attachment only for image format and keeps text fallback", () => {
    expect(
      validateReplyInput(
        ReplyFormat.image,
        makeMessage({
          attachments: [{ fileType: "image", originPath: "/image.jpg" }],
        }),
      ),
    ).toEqual(accepted("/image.jpg", "attachment"))
    expect(
      validateReplyInput(
        ReplyFormat.image,
        makeMessage({
          text: "caption should not override unsupported attachment",
          attachments: [{ fileType: "file", originPath: "/doc.pdf" }],
        }),
      ),
    ).toEqual(rejected("getUserData: unsupported file type"))
    expect(
      validateReplyInput(
        ReplyFormat.image,
        makeMessage({ text: "legacy image fallback" }),
      ),
    ).toEqual(accepted("legacy image fallback"))
  })

  test("accepts any attachment for file format and keeps text fallback", () => {
    expect(
      validateReplyInput(
        ReplyFormat.file,
        makeMessage({
          attachments: [{ fileType: "audio", originPath: "/voice.mp3" }],
        }),
      ),
    ).toEqual(accepted("/voice.mp3", "attachment"))
    expect(
      validateReplyInput(
        ReplyFormat.file,
        makeMessage({ text: "legacy file fallback" }),
      ),
    ).toEqual(accepted("legacy file fallback"))
    expect(validateReplyInput(ReplyFormat.file, makeMessage())).toEqual(
      rejected("getUserData: expected text input"),
    )
  })

  test("accepts anyInput text", () => {
    expect(
      validateReplyInput(
        ReplyFormat.anyInput,
        makeMessage({ text: "free-form answer" }),
      ),
    ).toEqual(accepted("free-form answer"))
  })

  test("accepts anyInput attachments", () => {
    const attachmentCases: ReplyInputMessage["attachments"] = [
      { fileType: "image", originPath: "/image.jpg" },
      { fileType: "video", originPath: "/video.mp4" },
      { fileType: "audio", originPath: "/audio.mp3" },
      { fileType: "gif", originPath: "/animation.gif" },
      { fileType: "file", originPath: "/document.pdf" },
    ]

    for (const attachment of attachmentCases) {
      expect(
        validateReplyInput(
          ReplyFormat.anyInput,
          makeMessage({ attachments: [attachment] }),
        ),
      ).toEqual(accepted(attachment.originPath, "attachment"))
    }
  })

  test("accepts anyInput location as latitude and longitude text", () => {
    expect(
      validateReplyInput(
        ReplyFormat.anyInput,
        makeMessage({
          contentType: "location",
          contentAttributes: { latitude: 10.5, longitude: 106.75 },
        }),
      ),
    ).toEqual(accepted("10.5,106.75", "location"))
  })

  test("rejects empty anyInput messages", () => {
    expect(validateReplyInput(ReplyFormat.anyInput, makeMessage())).toEqual(
      rejected("getUserData: expected text input"),
    )
  })
})

describe("reply input combinators", () => {
  test("firstAccepted returns the first accepted result", () => {
    const rejectFirst: ReplyValidator = () => rejected("first rejected")
    const acceptSecond: ReplyValidator = () => accepted("second accepted")
    const acceptThird: ReplyValidator = () => accepted("third accepted")

    expect(
      firstAccepted(rejectFirst, acceptSecond, acceptThird)(makeMessage()),
    ).toEqual(accepted("second accepted"))
  })

  test("firstAccepted returns the last rejection when all validators reject", () => {
    const rejectFirst: ReplyValidator = () => rejected("first rejected")
    const rejectSecond: ReplyValidator = () => rejected("second rejected")

    expect(firstAccepted(rejectFirst, rejectSecond)(makeMessage())).toEqual(
      rejected("second rejected"),
    )
  })

  test("fromAttachment rejects unsupported file types", () => {
    expect(
      fromAttachment((fileType) => fileType === "image")(
        makeMessage({
          attachments: [{ fileType: "video", originPath: "/video.mp4" }],
        }),
      ),
    ).toEqual(rejected("getUserData: unsupported file type"))
  })

  test("fromLocation accepts alternate latitude and longitude attribute names", () => {
    expect(
      fromLocation(
        makeMessage({
          contentType: "location",
          contentAttributes: { lat: "21.0278", long: "105.8342" },
        }),
      ),
    ).toEqual(accepted("21.0278,105.8342", "location"))
  })

  test("fromLocation rejects non-finite coordinates", () => {
    expect(
      fromLocation(
        makeMessage({
          contentType: "location",
          contentAttributes: { latitude: "NaN", longitude: 106.75 },
        }),
      ),
    ).toEqual(rejected("getUserData: invalid location"))
  })
})
