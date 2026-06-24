"use server"

import { clearMustChangePassword } from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { APIError } from "better-auth"
import { headers } from "next/headers"
import { auth } from "@/lib/auth/auth"
import { getCurrentUserId } from "@/lib/auth/utils"
import { actionClient } from "@/lib/safe-action"
import { changePasswordRequest } from "../schemas/action"

/**
 * Change the caller's password and clear the forced-change gate in one
 * server-side step. better-auth re-verifies `currentPassword` server-side, so
 * the flag is only ever cleared as part of a genuine, authenticated change —
 * there is no standalone "clear the flag" path a client could call to keep a
 * provisioned temporary password. `revokeOtherSessions` rotates the session;
 * the `nextCookies` plugin relays the refreshed cookie back to the browser.
 *
 * Runs on the base `actionClient` (NOT `authActionClient`) on purpose: the
 * authenticated client now gates every action behind `mustChangePassword`, and
 * this is the one action that must stay callable while the flag is set. It
 * re-resolves the user id itself instead of relying on the gated ctx.
 */
export const forceChangePasswordAction = actionClient
  .inputSchema(changePasswordRequest)
  .action(async ({ parsedInput }) => {
    const userId = await getCurrentUserId()
    if (!userId) {
      throw new ChatbotXException("Not authenticated", "unauthorized", 401)
    }

    const requestHeaders = await headers()

    try {
      await auth.api.changePassword({
        body: {
          currentPassword: parsedInput.currentPassword,
          newPassword: parsedInput.newPassword,
          revokeOtherSessions: true,
        },
        headers: requestHeaders,
      })
    } catch (error) {
      if (error instanceof APIError) {
        throw new ChatbotXException(
          error.body?.message ?? "Failed to change password",
          "changePasswordFailed",
          400,
        )
      }
      throw error
    }

    await clearMustChangePassword(userId)

    // Refresh the session cookie cache so the cleared flag is visible on the
    // very next request. `changePassword` rotated the session cookie using
    // better-auth's in-memory user (still `mustChangePassword: true`); the raw
    // DB update above is invisible to better-auth, so without this the cookie
    // cache would keep reporting `true` for up to its 5-min TTL — bouncing the
    // user back to /auth/change-password in a loop. A `disableCookieCache` read
    // forces a fresh DB read and rewrites the `session_data` cookie, which
    // `nextCookies` relays to the browser.
    await auth.api.getSession({
      headers: requestHeaders,
      query: { disableCookieCache: true },
    })

    return { ok: true }
  })
