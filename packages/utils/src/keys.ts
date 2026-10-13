import { createEnv } from "@t3-oss/env-core"
import { z } from "zod"

const positiveInt = (max: number) => z.coerce.number().int().min(1).max(max)
const savingPercent = z.coerce.number().int().min(0).max(90)
const quality = z.coerce.number().int().min(1).max(100)

export const keys = () =>
  createEnv({
    server: {
      FORCE_PUBLIC_HTTPS: z.stringbool().optional().default(false),
      // Channels whose webhook keeps the provider's media URL instead of
      // downloading the media (comma separated; empty = download everywhere).
      // Only channels whose provider can serve the media again belong here.
      LIVE_MEDIA_LAZY_CHANNELS: z.string().default("messenger,instagram"),
      // Same for contact profile pictures: not downloaded at contact creation,
      // fetched when the inbox or a system field first needs the picture.
      LIVE_AVATAR_LAZY_CHANNELS: z.string().default("messenger,instagram"),
    },
    runtimeEnv: process.env,
    skipValidation: process.env.SKIP_ENV_CHECK === "true",
  })

/**
 * Image compression tuning, validated separately from `keys()`: a bad value
 * here only affects compression (callers keep the original image), never the
 * other settings read on the webhook path.
 */
export const imageOptimizationKeys = () =>
  createEnv({
    server: {
      // Kill switch for every image re-encode (inline, on demand, job).
      STORED_IMAGE_OPTIMIZATION: z.enum(["on", "off"]).default("on"),
      // Re-encoding policy (see `image-optimize.ts`). Photos are stored as
      // JPEG, avatars as WebP; the longest side is capped, never enlarged.
      STORED_IMAGE_MEDIA_MAX_DIMENSION: positiveInt(8192).default(1600),
      STORED_IMAGE_MEDIA_QUALITY: quality.default(80),
      // The re-encode is kept only when it is at least this much smaller.
      STORED_IMAGE_MEDIA_MIN_SAVING_PERCENT: savingPercent.default(20),
      STORED_IMAGE_AVATAR_MAX_DIMENSION: positiveInt(2048).default(256),
      STORED_IMAGE_AVATAR_QUALITY: quality.default(80),
      STORED_IMAGE_AVATAR_MIN_SAVING_PERCENT: savingPercent.default(10),
      // Decode guard: larger images are stored as they are (a small but
      // highly compressible PNG can declare enough pixels to exhaust memory).
      STORED_IMAGE_MAX_INPUT_MEGAPIXELS: positiveInt(100).default(16),
      STORED_IMAGE_ENCODE_TIMEOUT_SECONDS: positiveInt(60).default(2),
      // Inline encoding before the first write (eager channels). Anything
      // over these limits is stored as received and re-encoded by the job.
      STORED_IMAGE_INLINE_MAX_MB: z.coerce
        .number()
        .positive()
        .max(50)
        .default(2),
      STORED_IMAGE_INLINE_MAX_MEGAPIXELS: positiveInt(100).default(8),
      STORED_IMAGE_INLINE_AVATAR_MAX_MEGAPIXELS: positiveInt(100).default(4),
      // Encodes running at once per process; 0 leaves every image to the job.
      STORED_IMAGE_INLINE_CONCURRENCY: z.coerce
        .number()
        .int()
        .min(0)
        .max(32)
        .default(2),
      // Background job: attachments under the floor are not worth a
      // download and a write; sources over the ceiling stay as they are.
      STORED_IMAGE_JOB_MIN_SOURCE_KB: z.coerce
        .number()
        .int()
        .min(0)
        .max(10_240)
        .default(32),
      STORED_IMAGE_JOB_MAX_SOURCE_MB: positiveInt(100).default(10),
    },
    runtimeEnv: process.env,
    skipValidation: process.env.SKIP_ENV_CHECK === "true",
  })
