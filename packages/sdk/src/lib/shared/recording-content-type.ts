/**
 * Allowed WhatsApp call-recording mime types → their object-storage file
 * extension. Meta-native recordings arrive as `audio/ogg`; the
 * browser-recorded path (call-recorder upload) may post any of the others
 * depending on `MediaRecorder`'s supported mime types. Kept as a single
 * object so a new allowed format is a one-line addition, never a scattered
 * if/else.
 *
 * Canonical source of truth — both `@chatbotx.io/business`'s
 * `call-recording-service.ts` (server-side upload/validation) and the
 * builder's client-side `call-recorder.ts` (which cannot import a
 * business-layer package into a client bundle) read this list from
 * `@chatbotx.io/sdk`, which is client-safe.
 */
export const ALLOWED_RECORDING_CONTENT_TYPES = {
  "audio/ogg": "ogg",
  "audio/webm": "webm",
  "audio/mp4": "m4a",
  "audio/mpeg": "mp3",
} as const

export type RecordingContentType = keyof typeof ALLOWED_RECORDING_CONTENT_TYPES
