import { describe, expect, test } from "vitest"
import { pinAnswerDtlsSetup } from "../src/whatsapp-call/voip-sdp"

describe("pinAnswerDtlsSetup", () => {
  test("rewrites an actpass setup line to active, keeping CRLF line endings", () => {
    const sdp = "v=0\r\na=setup:actpass\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n"

    expect(pinAnswerDtlsSetup(sdp)).toBe(
      "v=0\r\na=setup:active\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n",
    )
  })

  test("rewrites every actpass line, at session and media level", () => {
    const sdp = [
      "v=0",
      "a=setup:actpass",
      "m=audio 9 UDP/TLS/RTP/SAVPF 111",
      "a=setup:actpass",
      "",
    ].join("\n")

    expect(pinAnswerDtlsSetup(sdp)).toBe(
      [
        "v=0",
        "a=setup:active",
        "m=audio 9 UDP/TLS/RTP/SAVPF 111",
        "a=setup:active",
        "",
      ].join("\n"),
    )
  })

  test("rewrites an actpass line with no trailing newline", () => {
    expect(pinAnswerDtlsSetup("v=0\r\na=setup:actpass")).toBe(
      "v=0\r\na=setup:active",
    )
  })

  test("leaves a valid answer role untouched", () => {
    const active = "v=0\r\na=setup:active\r\n"
    const passive = "v=0\r\na=setup:passive\r\n"

    expect(pinAnswerDtlsSetup(active)).toBe(active)
    expect(pinAnswerDtlsSetup(passive)).toBe(passive)
  })

  test("never touches actpass text that is not a whole setup attribute line", () => {
    const sdp = "v=0\r\na=x-note:a=setup:actpass\r\na=setup:actpassive\r\n"

    expect(pinAnswerDtlsSetup(sdp)).toBe(sdp)
  })
})
