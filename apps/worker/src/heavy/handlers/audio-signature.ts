/**
 * Recognises an audio container from the first bytes of a file, for downloads
 * whose `content-type` says nothing (`application/octet-stream`, no header).
 *
 * It only chooses WHICH audio format a file is; every type returned is one of
 * the speech-to-text allowlist's. A file it does not recognise is `null`, never
 * a guess, so the caller keeps rejecting it.
 */

/** How many leading bytes `sniffAudioMimeType` may look at. */
export const AUDIO_SIGNATURE_BYTES = 16

const MPEG_FRAME_SYNC = 0xff
// The second byte starts with three more sync bits (0b111xxxxx).
const MPEG_SECOND_BYTE_MIN = 0xe0
const MPEG_RESERVED_VERSION = 1
const MPEG_RESERVED_LAYER = 0
const MPEG_INVALID_BITRATE_INDEX = 15
const MPEG_INVALID_SAMPLE_RATE_INDEX = 3

const matchesAscii = (
  head: Uint8Array,
  offset: number,
  text: string,
): boolean => {
  if (head.length < offset + text.length) {
    return false
  }
  for (let index = 0; index < text.length; index++) {
    if (head[offset + index] !== text.charCodeAt(index)) {
      return false
    }
  }
  return true
}

// An MPEG audio frame header: 11 sync bits, then a version and a layer that
// are not the reserved values. A layer of 0 is ADTS (raw AAC), which shares the
// sync bits but is not MP3, so it is left unrecognised. Plain arithmetic keeps
// the bit fields readable without bitwise operators (lint forbids them).
const isMpegAudioFrame = (head: Uint8Array): boolean => {
  const first = head[0]
  const second = head[1]
  if (
    first !== MPEG_FRAME_SYNC ||
    second === undefined ||
    second < MPEG_SECOND_BYTE_MIN
  ) {
    return false
  }
  const version = Math.floor(second / 8) % 4
  const layer = Math.floor(second / 2) % 4
  if (version === MPEG_RESERVED_VERSION || layer === MPEG_RESERVED_LAYER) {
    return false
  }
  const third = head[2]
  if (third === undefined) {
    return true
  }
  const bitrateIndex = Math.floor(third / 16)
  const sampleRateIndex = Math.floor(third / 4) % 4
  return (
    bitrateIndex !== MPEG_INVALID_BITRATE_INDEX &&
    sampleRateIndex !== MPEG_INVALID_SAMPLE_RATE_INDEX
  )
}

const isEbml = (head: Uint8Array): boolean =>
  head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3

// `ftyp` brands of still images (HEIF/HEIC/AVIF). They share the box layout with
// MP4 audio but are never audio. Video brands are NOT listed: MP4 audio and
// video share `isom`/`mp42`, so the header cannot tell them apart.
const IMAGE_FTYP_BRANDS: ReadonlySet<string> = new Set([
  "heic",
  "heix",
  "heim",
  "heis",
  "hevc",
  "hevx",
  "mif1",
  "msf1",
  "avif",
  "avis",
])

export const sniffAudioMimeType = (head: Uint8Array): string | null => {
  // `ftyp` sits after a 4-byte box size. It also opens MP4 video and MOV, so
  // the result means "a container speech-to-text can read", not "audio only":
  // the transcription provider still has the final say on the content.
  if (matchesAscii(head, 4, "ftyp")) {
    const brand = String.fromCharCode(...head.subarray(8, 12))
    return IMAGE_FTYP_BRANDS.has(brand) ? null : "audio/mp4"
  }
  if (matchesAscii(head, 0, "ID3") || isMpegAudioFrame(head)) {
    return "audio/mpeg"
  }
  if (matchesAscii(head, 0, "OggS")) {
    return "audio/ogg"
  }
  if (matchesAscii(head, 0, "RIFF") && matchesAscii(head, 8, "WAVE")) {
    return "audio/wav"
  }
  if (matchesAscii(head, 0, "fLaC")) {
    return "audio/flac"
  }
  if (isEbml(head)) {
    return "audio/webm"
  }
  return null
}

/** `sniffAudioMimeType` with the head length it needs, for `downloadWithByteLimit`. */
export const audioSniffer = {
  bytes: AUDIO_SIGNATURE_BYTES,
  sniff: sniffAudioMimeType,
}
