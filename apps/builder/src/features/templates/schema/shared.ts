import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"

/** `{ templateInboxId: installerInboxId }`: which inbox stands in for each inbox a template was built around. */
export const inboxBindingsSchema = z.record(
  zodBigintAsString(),
  zodBigintAsString(),
)

/** A client-generated idempotency key (the API header allows the same length). */
export const idempotencyKeySchema = z.string().trim().min(1).max(255)

export const shareTokenSchema = z.string().trim().min(1)

export const PUBLISHER_REF_FORMAT = /^[0-9a-f]{16,64}$/

// Standard YouTube video ids are exactly 11 characters from this alphabet.
export const YOUTUBE_VIDEO_ID_FORMAT = /^[A-Za-z0-9_-]{11}$/
