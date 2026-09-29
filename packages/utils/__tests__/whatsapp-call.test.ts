import { describe, expect, test } from "vitest"
import { transcribesCalls } from "../src/whatsapp-call"

describe("transcribesCalls", () => {
  test("is on only when the number both records and transcribes calls", () => {
    expect(
      transcribesCalls({
        callRecordingEnabled: true,
        callTranscriptionEnabled: true,
      }),
    ).toBe(true)
  })

  test("is off when transcription is on but recording is off", () => {
    expect(
      transcribesCalls({
        callRecordingEnabled: false,
        callTranscriptionEnabled: true,
      }),
    ).toBe(false)
  })

  test("is off when transcription itself is off", () => {
    expect(
      transcribesCalls({
        callRecordingEnabled: true,
        callTranscriptionEnabled: false,
      }),
    ).toBe(false)
  })
})
