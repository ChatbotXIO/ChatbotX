import { getChildLogger } from "@chatbotx.io/logger"
import { imageOptimizationKeys } from "./keys"

/**
 * The image re-encoding policy and its process-wide limits. Kept apart from
 * `image-optimize.ts` so code that only needs the settings (queue producers,
 * request handlers) never loads the native `sharp` addon.
 */
const logger = getChildLogger("image-optimize")

const MEGAPIXEL = 1_000_000
const KIB = 1024
const MIB = 1024 * 1024

export type ProfileSettings = {
  maxDimension: number
  quality: number
  /** The re-encode is kept only when it saves at least this share. */
  minSavingPercent: number
}

export type ImageOptimizationSettings = {
  media: ProfileSettings
  avatar: ProfileSettings
  /** Decode guard: larger images are kept as they are. */
  maxInputPixels: number
  /** Bounds a pathological encode; the source is kept when it trips. */
  encodeTimeoutSeconds: number
  /** Encoding before the first write; see `store-incoming-image.ts`. */
  inline: {
    maxBytes: number
    maxPixels: Record<"avatar" | "media", number>
    maxConcurrentEncodes: number
  }
  /** The background re-encode job of an already stored object. */
  job: { minSourceBytes: number; maxSourceBytes: number }
}

/**
 * The re-encoding policy, configured through `STORED_IMAGE_*` environment
 * variables (defaults in `keys.ts`). Read per call, so a changed value and a
 * stubbed env in tests apply without a reload.
 */
export const getImageOptimizationSettings = (): ImageOptimizationSettings => {
  const env = imageOptimizationKeys()
  return {
    media: {
      maxDimension: env.STORED_IMAGE_MEDIA_MAX_DIMENSION,
      quality: env.STORED_IMAGE_MEDIA_QUALITY,
      minSavingPercent: env.STORED_IMAGE_MEDIA_MIN_SAVING_PERCENT,
    },
    avatar: {
      maxDimension: env.STORED_IMAGE_AVATAR_MAX_DIMENSION,
      quality: env.STORED_IMAGE_AVATAR_QUALITY,
      minSavingPercent: env.STORED_IMAGE_AVATAR_MIN_SAVING_PERCENT,
    },
    maxInputPixels: env.STORED_IMAGE_MAX_INPUT_MEGAPIXELS * MEGAPIXEL,
    encodeTimeoutSeconds: env.STORED_IMAGE_ENCODE_TIMEOUT_SECONDS,
    inline: {
      maxBytes: Math.round(env.STORED_IMAGE_INLINE_MAX_MB * MIB),
      maxPixels: {
        media: env.STORED_IMAGE_INLINE_MAX_MEGAPIXELS * MEGAPIXEL,
        avatar: env.STORED_IMAGE_INLINE_AVATAR_MAX_MEGAPIXELS * MEGAPIXEL,
      },
      maxConcurrentEncodes: env.STORED_IMAGE_INLINE_CONCURRENCY,
    },
    job: {
      minSourceBytes: env.STORED_IMAGE_JOB_MIN_SOURCE_KB * KIB,
      maxSourceBytes: env.STORED_IMAGE_JOB_MAX_SOURCE_MB * MIB,
    },
  }
}

/**
 * `STORED_IMAGE_OPTIMIZATION=off` turns every re-encode off: inline, on
 * demand and the background job. A misconfigured `STORED_IMAGE_*` value turns
 * it off too, loudly, rather than failing the caller (a webhook or a job).
 */
export const isStoredImageOptimizationEnabled = (): boolean => {
  try {
    return imageOptimizationKeys().STORED_IMAGE_OPTIMIZATION === "on"
  } catch (err) {
    logger.error(
      { err },
      "Invalid STORED_IMAGE_* setting; image optimization is off",
    )
    return false
  }
}

// Encodes running in this process: decoding a photo takes tens of MB, so
// every request-path encode (inline on a webhook, on-demand mirror) shares
// one bounded set of slots.
let activeEncodes = 0
const waitingEncodes: (() => void)[] = []
// Each waiting caller holds the image it already downloaded, so the queue is
// bounded too: past this many waiters per slot a caller goes on without
// encoding rather than piling memory up behind a backlog.
const MAX_WAITING_PER_SLOT = 4

const releaseEncodeSlot = (): void => {
  const next = waitingEncodes.shift()
  if (next) {
    // Hand the slot straight to the next caller: the count stays the same.
    next()
    return
  }
  activeEncodes -= 1
}

/**
 * Runs `work` in one of `limit` per-process encode slots. With `wait: false`
 * it returns null at once when every slot is taken (the caller stores the
 * original and leaves the encode to the background job); with `wait: true` it
 * waits its turn, unless the queue is already full, then it returns null too.
 */
export async function runInEncodeSlot<T>(
  options: { limit: number; wait: boolean },
  work: () => Promise<T>,
): Promise<{ value: T } | null> {
  if (activeEncodes >= options.limit) {
    if (
      !options.wait ||
      waitingEncodes.length >= options.limit * MAX_WAITING_PER_SLOT
    ) {
      return null
    }
    await new Promise<void>((resolve) => waitingEncodes.push(resolve))
  } else {
    activeEncodes += 1
  }
  try {
    return { value: await work() }
  } finally {
    releaseEncodeSlot()
  }
}
