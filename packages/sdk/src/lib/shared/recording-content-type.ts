/**
 * Allowed WhatsApp call-recording mime types → object-storage file extension.
 * Meta-native recordings arrive as `audio/ogg`; the browser-recorded path may post
 * any of the others depending on `MediaRecorder`'s supported mime types. Lives in
 * `@chatbotx.io/sdk` (client-safe) so both the server-side `call-recording-service.ts`
 * and the builder's client-side `call-recorder.ts` share one source of truth.
 */
export const ALLOWED_RECORDING_CONTENT_TYPES = {
  "audio/ogg": "ogg",
  "audio/webm": "webm",
  "audio/mp4": "m4a",
  "audio/mpeg": "mp3",
} as const

export type RecordingContentType = keyof typeof ALLOWED_RECORDING_CONTENT_TYPES
