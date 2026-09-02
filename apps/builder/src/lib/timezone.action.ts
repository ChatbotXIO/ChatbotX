"use server"

import { resolveFilterTimezone } from "@chatbotx.io/utils/datetime"
import { cookies } from "next/headers"
import {
  TIMEZONE_COOKIE_MAX_AGE_SECONDS,
  TIMEZONE_COOKIE_NAME,
} from "./timezone-cookie"

/**
 * Persists the browser's IANA zone for `getUserTimezone`. Input is validated
 * at this boundary: a zone this runtime cannot resolve is ignored rather than
 * stored, so the cookie never carries an arbitrary client string.
 */
export async function setUserTimezone(timezone: string): Promise<void> {
  if (resolveFilterTimezone(timezone) !== timezone) {
    return
  }
  ;(await cookies()).set(TIMEZONE_COOKIE_NAME, timezone, {
    path: "/",
    maxAge: TIMEZONE_COOKIE_MAX_AGE_SECONDS,
    sameSite: "lax",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  })
}
