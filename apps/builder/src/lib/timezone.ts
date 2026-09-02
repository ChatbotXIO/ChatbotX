import "server-only"

import { resolveFilterTimezone } from "@chatbotx.io/utils/datetime"
import { cookies } from "next/headers"
import { cache } from "react"
import { TIMEZONE_COOKIE_NAME } from "./timezone-cookie"

/**
 * The user's IANA timezone as stamped by `TimezoneSync`, or `"UTC"` when the
 * cookie is missing or names a zone this runtime cannot resolve. Never the
 * server process zone — that would silently differ between environments.
 *
 * Request-scoped via `cache()`: the root layout, the next-intl request config
 * and timezone-aware pages all read it during one render, so the cookie is
 * parsed and validated once per request.
 */
export const getUserTimezone = cache(
  async (): Promise<string> =>
    resolveFilterTimezone((await cookies()).get(TIMEZONE_COOKIE_NAME)?.value),
)
