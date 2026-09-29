import { describe, expect, test } from "vitest"
import {
  IntegrationJobAction,
  type IntegrationJobData,
  whatsappCallNativeRecordingFetchJobId,
  whatsappCallNativeTranscriptFetchJobId,
  whatsappCallRecordingReadyJobId,
} from "../src/queues/integration"

describe("IntegrationJobAction native media fetch actions", () => {
  test("registers the two new job actions", () => {
    expect(IntegrationJobAction.whatsappCallNativeRecordingFetch).toBe(
      "whatsappCallNativeRecordingFetch",
    )
    expect(IntegrationJobAction.whatsappCallNativeTranscriptFetch).toBe(
      "whatsappCallNativeTranscriptFetch",
    )
  })
})

describe("whatsappCallNativeRecordingFetch payload shape", () => {
  test("carries only slim media references, never sdp or audio bytes", () => {
    const payload: IntegrationJobData = {
      type: IntegrationJobAction.whatsappCallNativeRecordingFetch,
      data: {
        whatsappCallId: "call-1",
        wacid: "wacid-1",
        workspaceId: "ws-1",
        audioMediaId: "media-1",
        audioUrl: "https://graph.facebook.com/v1/media-1",
        mimeType: "audio/ogg; codecs=opus",
      },
    }

    expect(payload.data).not.toHaveProperty("sdp")
    expect(payload.data).not.toHaveProperty("audio")
    expect(payload.data).not.toHaveProperty("bytes")
    expect(payload.data).not.toHaveProperty("buffer")
    expect(Object.keys(payload.data).sort()).toEqual(
      [
        "audioMediaId",
        "audioUrl",
        "mimeType",
        "wacid",
        "whatsappCallId",
        "workspaceId",
      ].sort(),
    )
  })
})

describe("whatsappCallNativeTranscriptFetch payload shape", () => {
  test("carries only slim media references, never inlined transcript segments", () => {
    const payload: IntegrationJobData = {
      type: IntegrationJobAction.whatsappCallNativeTranscriptFetch,
      data: {
        whatsappCallId: "call-1",
        wacid: "wacid-1",
        workspaceId: "ws-1",
        documentMediaId: "doc-1",
        documentUrl: "https://graph.facebook.com/v1/doc-1",
      },
    }

    expect(payload.data).not.toHaveProperty("segments")
    expect(payload.data).not.toHaveProperty("transcript")
    expect(payload.data).not.toHaveProperty("sdp")
    expect(Object.keys(payload.data).sort()).toEqual(
      [
        "documentMediaId",
        "documentUrl",
        "wacid",
        "whatsappCallId",
        "workspaceId",
      ].sort(),
    )
  })
})

describe("native media fetch job id helpers", () => {
  test("whatsappCallNativeRecordingFetchJobId is stable and keyed by wacid", () => {
    expect(whatsappCallNativeRecordingFetchJobId("wacid-1")).toBe(
      "native-rec-fetch-wacid-1",
    )
    expect(whatsappCallNativeRecordingFetchJobId("wacid-1")).toBe(
      whatsappCallNativeRecordingFetchJobId("wacid-1"),
    )
    expect(whatsappCallNativeRecordingFetchJobId("wacid-1")).not.toBe(
      whatsappCallNativeRecordingFetchJobId("wacid-2"),
    )
  })

  test("whatsappCallNativeTranscriptFetchJobId is stable and keyed by wacid", () => {
    expect(whatsappCallNativeTranscriptFetchJobId("wacid-1")).toBe(
      "native-transcript-fetch-wacid-1",
    )
    expect(whatsappCallNativeTranscriptFetchJobId("wacid-1")).toBe(
      whatsappCallNativeTranscriptFetchJobId("wacid-1"),
    )
    expect(whatsappCallNativeTranscriptFetchJobId("wacid-1")).not.toBe(
      whatsappCallNativeTranscriptFetchJobId("wacid-2"),
    )
  })

  test("the two new job ids never collide with each other for the same wacid", () => {
    expect(whatsappCallNativeRecordingFetchJobId("wacid-1")).not.toBe(
      whatsappCallNativeTranscriptFetchJobId("wacid-1"),
    )
  })

  test("the two new job ids never collide with the existing whatsappCallRecordingReady job id", () => {
    // whatsappCallRecordingReadyJobId is keyed by WhatsappCall.id, not wacid,
    // but both are opaque strings — assert no collision even when the same
    // string value is used for both.
    expect(whatsappCallNativeRecordingFetchJobId("call-1")).not.toBe(
      whatsappCallRecordingReadyJobId("call-1"),
    )
    expect(whatsappCallNativeTranscriptFetchJobId("call-1")).not.toBe(
      whatsappCallRecordingReadyJobId("call-1"),
    )
  })
})
