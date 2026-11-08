import ky from "ky"
import { z } from "zod"
import { API_URL, DEFAULT_API_VERSION } from "../constants"
import { rescue, WhatsappException } from "../exception"
import type { WhatsappAuthValue } from "../schema"

/** What Meta says about THIS app's Conversation Routing roles on a number. */
export type WhatsappRoutingRoles = {
  /** `false`: Meta says conversation routing is not enabled for the number. */
  enabled: boolean
  roles: string[]
  isStandby: boolean
}

const routingRolesResponseSchema = z.object({
  roles: z.array(z.string()),
  is_standby: z.boolean(),
})

/**
 * Meta answers code 100 "Conversation routing is not enabled for this phone
 * number." for a number without routing; every other code-100 message (wrong
 * id, missing permission) stays an error.
 */
const ROUTING_NOT_ENABLED_RE = /conversation routing is not enabled/i

const isRoutingNotEnabled = (error: unknown): boolean =>
  error instanceof WhatsappException &&
  Number(error.code) === 100 &&
  ROUTING_NOT_ENABLED_RE.test(error.message)

/**
 * `GET /{phone_number_id}/routing_roles` — the roles the calling app holds on
 * the number and whether it has standby access. "Both fields are always
 * present"; an empty `roles` array is a successful answer (no role assigned).
 * Like `triggerSmbAppDataSync`, takes only the auth fields it reads, so the
 * builder can call it with the primitives the business layer hands back.
 *
 * Reference: https://developers.facebook.com/documentation/business-messaging/whatsapp/conversation-routing/routing-roles/
 */
export const getRoutingRoles = async ({
  auth,
  phoneNumberId,
}: {
  auth: Pick<WhatsappAuthValue, "tokens" | "version">
  phoneNumberId: string
}): Promise<WhatsappRoutingRoles> => {
  const { version = DEFAULT_API_VERSION } = auth
  try {
    const body = await rescue(
      async () =>
        await ky
          .get(`${API_URL}/${version}/${phoneNumberId}/routing_roles`, {
            headers: { Authorization: `Bearer ${auth.tokens.accessToken}` },
          })
          .json(),
    )
    const parsed = routingRolesResponseSchema.parse(body)
    return { enabled: true, roles: parsed.roles, isStandby: parsed.is_standby }
  } catch (error) {
    if (isRoutingNotEnabled(error)) {
      return { enabled: false, roles: [], isStandby: false }
    }
    throw error
  }
}
