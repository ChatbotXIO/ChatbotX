import { z } from "zod"
import { IDEMPOTENCY_KEY_HEADER } from "@/lib/idempotency/constants"

/** What a client-generated key looks like (the API header allows the same length). */
const templateIdempotencyKeySchema = z.string().trim().min(1).max(255)

/**
 * The request's `Idempotency-Key` header, which a sync or reinstall stores on
 * its row so a replay returns the same sync. The API idempotency middleware
 * already rejected an invalid key.
 */
export const readIdempotencyKey = (context: {
  headers: Headers
}): string | undefined => {
  const parsed = templateIdempotencyKeySchema.safeParse(
    context.headers.get(IDEMPOTENCY_KEY_HEADER) ?? undefined,
  )
  return parsed.success ? parsed.data : undefined
}
