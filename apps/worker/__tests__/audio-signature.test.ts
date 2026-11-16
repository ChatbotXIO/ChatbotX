import { describe, expect, test } from "vitest"
import {
  AUDIO_SIGNATURE_BYTES,
  audioSniffer,
  sniffAudioMimeType,
} from "../src/heavy/handlers/audio-signature"

const ascii = (text: string): number[] =>
  [...text].map((char) => char.charCodeAt(0))

const bytes = (...parts: number[][]): Uint8Array =>
  Uint8Array.from(parts.flat())

describe("sniffAudioMimeType", () => {
  test("recognises an MP4 container (a Messenger voice note) by ftyp", () => {
    // The real clip starts 00 00 00 18 'ftyp' 'mp42'.
    expect(sniffAudioMimeType(bytes([0, 0, 0, 0x18], ascii("ftypmp42")))).toBe(
      "audio/mp4",
    )
  })

  test.each([
    ["ID3 tag", bytes(ascii("ID3"), [4, 0, 0, 0, 0, 0, 0x21])],
    // MPEG-1 Layer III, 128 kbps, 44.1 kHz.
    ["MPEG-1 layer III frame", bytes([0xff, 0xfb, 0x90, 0x00])],
    // MPEG-2 Layer III.
    ["MPEG-2 layer III frame", bytes([0xff, 0xf3, 0x90, 0x00])],
  ])("recognises MP3 by its %s", (_name, head) => {
    expect(sniffAudioMimeType(head)).toBe("audio/mpeg")
  })

  test("recognises Ogg, FLAC and EBML (WebM)", () => {
    expect(sniffAudioMimeType(bytes(ascii("OggS"), [0, 2]))).toBe("audio/ogg")
    expect(sniffAudioMimeType(bytes(ascii("fLaC"), [0, 0]))).toBe("audio/flac")
    expect(sniffAudioMimeType(bytes([0x1a, 0x45, 0xdf, 0xa3, 0x9f]))).toBe(
      "audio/webm",
    )
  })

  test("recognises WAV only when RIFF is followed by WAVE", () => {
    expect(
      sniffAudioMimeType(
        bytes(ascii("RIFF"), [0x24, 0, 0, 0], ascii("WAVEfmt ")),
      ),
    ).toBe("audio/wav")
    // Other RIFF files (AVI video, WebP image) are not audio.
    expect(
      sniffAudioMimeType(
        bytes(ascii("RIFF"), [0x24, 0, 0, 0], ascii("AVI LIST")),
      ),
    ).toBeNull()
    expect(
      sniffAudioMimeType(
        bytes(ascii("RIFF"), [0x24, 0, 0, 0], ascii("WEBPVP8 ")),
      ),
    ).toBeNull()
  })

  test("does not mistake raw AAC (ADTS) for MP3", () => {
    // 0xFFF1 is an ADTS header: the layer bits are 00.
    expect(sniffAudioMimeType(bytes([0xff, 0xf1, 0x50, 0x80]))).toBeNull()
    expect(sniffAudioMimeType(bytes([0xff, 0xf9, 0x50, 0x80]))).toBeNull()
  })

  test("rejects MPEG frames with reserved header values", () => {
    // Reserved version (01).
    expect(sniffAudioMimeType(bytes([0xff, 0xeb, 0x90, 0x00]))).toBeNull()
    // Invalid bitrate index (1111).
    expect(sniffAudioMimeType(bytes([0xff, 0xfb, 0xf0, 0x00]))).toBeNull()
    // Reserved sample rate (11).
    expect(sniffAudioMimeType(bytes([0xff, 0xfb, 0x9c, 0x00]))).toBeNull()
  })

  test.each([
    ["HTML", bytes(ascii("<!doctype html>"))],
    ["PDF", bytes(ascii("%PDF-1.7"))],
    ["PNG", bytes([0x89], ascii("PNG"), [0x0d, 0x0a, 0x1a, 0x0a])],
    ["JPEG", bytes([0xff, 0xd8, 0xff, 0xe0, 0, 0x10])],
    ["ZIP", bytes(ascii("PK"), [3, 4, 0, 0])],
    ["empty", new Uint8Array(0)],
    ["a single byte", bytes([0xff])],
  ])("does not recognise %s", (_name, head) => {
    expect(sniffAudioMimeType(head)).toBeNull()
  })

  test("only needs the leading AUDIO_SIGNATURE_BYTES", () => {
    expect(AUDIO_SIGNATURE_BYTES).toBeGreaterThanOrEqual(12)
  })

  test.each([
    ["HEIC", "heic"],
    ["HEIF sequence", "msf1"],
    ["AVIF", "avif"],
    ["HEIF", "mif1"],
  ])("does not mistake a %s image (ftyp %s) for audio", (_name, brand) => {
    expect(
      sniffAudioMimeType(bytes([0, 0, 0, 0x18], ascii("ftyp"), ascii(brand))),
    ).toBeNull()
  })

  test.each([
    "mp42",
    "M4A ",
    "isom",
    "3gp4",
    "qt  ",
  ])("keeps recognising an MP4/QuickTime container with brand %s", (brand) => {
    expect(
      sniffAudioMimeType(bytes([0, 0, 0, 0x18], ascii("ftyp"), ascii(brand))),
    ).toBe("audio/mp4")
  })

  test("still recognises a head too short to carry a brand", () => {
    expect(sniffAudioMimeType(bytes([0, 0, 0, 0x18], ascii("ftyp")))).toBe(
      "audio/mp4",
    )
  })

  test("audioSniffer pairs the sniffer with the head length it needs", () => {
    expect(audioSniffer.bytes).toBe(AUDIO_SIGNATURE_BYTES)
    expect(audioSniffer.sniff).toBe(sniffAudioMimeType)
  })
})
