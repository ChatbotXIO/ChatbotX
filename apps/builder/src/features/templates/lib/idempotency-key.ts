import { IDEMPOTENCY_KEY_HEADER } from "@/lib/idempotency/constants"
import { idempotencyKeySchema } from "../schema/shared"

/**
 * The request's `Idempotency-Key` header, which a sync or reinstall stores on
 * its row so a replay returns the same sync. The API idempotency middleware
 * already rejected an invalid key.
 */
export const readIdempotencyKey = (context: {
  headers: Headers
}): string | undefined => {
  const parsed = idempotencyKeySchema.safeParse(
    context.headers.get(IDEMPOTENCY_KEY_HEADER) ?? undefined,
  )
  return parsed.success ? parsed.data : undefined
}
