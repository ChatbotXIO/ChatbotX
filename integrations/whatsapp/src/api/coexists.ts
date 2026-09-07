import ky, { HTTPError } from "ky"
import type { WhatsappAuthValue } from ".."
import { API_URL, DEFAULT_API_VERSION } from "../constants"
import { rescue, WhatsappException } from "../exception"
import { logger } from "../lib/logger"

export type SmbSyncType = "smb_app_state_sync" | "history"

export type SmbAppDataResult =
  | { ok: true }
  | {
      ok: false
      reason: "already_triggered" | "window_expired" | "not_eligible"
    }

/**
 * Triggers Meta to push Coexistence sync data (contact state or message
 * history) for a given Business Phone Number. Without this call, Meta sends
 * nothing — webhook subscription alone is not sufficient.
 *
 * Each sync_type can only be triggered ONCE per onboarding. The 24h window
 * after embedded-signup completion is enforced by Meta. Detected error
 * responses are returned as structured results so the caller can persist
 * state and avoid re-attempts.
 */
export function triggerSmbAppDataSync({
  auth,
  phoneNumberId,
  syncType,
}: {
  /**
   * Only the two fields this call actually reads. Narrowed from the full
   * `WhatsappAuthValue` so callers that hold just a token and a version (the
   * builder's coexist route, which gets primitives back from the business
   * layer) no longer have to cast a partial object.
   */
  auth: Pick<WhatsappAuthValue, "tokens" | "version">
  phoneNumberId: string
  syncType: SmbSyncType
}): Promise<SmbAppDataResult> {
  const { version = DEFAULT_API_VERSION } = auth
  const url = `${API_URL}/${version}/${phoneNumberId}/smb_app_data`

  return rescue(async () => {
    try {
      const result = await ky
        .post<{ success: boolean }>(url, {
          headers: { Authorization: `Bearer ${auth.tokens.accessToken}` },
          json: { messaging_product: "whatsapp", sync_type: syncType },
        })
        .json()

      if (!result.success) {
        throw new WhatsappException(`smb_app_data ${syncType} failed`)
      }
      return { ok: true } as const
    } catch (error) {
      if (error instanceof HTTPError) {
        const body = error.data as
          | {
              error?: {
                code?: number
                error_subcode?: number
                message?: string
              }
            }
          | string
          | undefined
        const errObj = typeof body === "object" ? body?.error : undefined
        const code = errObj?.code
        const subCode = errObj?.error_subcode
        const message = errObj?.message ?? ""

        // Meta code 131000 / subcode 10: phone number is not a WhatsApp
        // Business App (SMB) onboarded number. Coexist sync cannot apply.
        if (code === 131_000 && subCode === 10) {
          logger.warn(
            { syncType, phoneNumberId },
            "smb_app_data not eligible (non-SMB phone)",
          )
          return { ok: false, reason: "not_eligible" } as const
        }

        // Meta returns generic "already triggered" / window errors under
        // various subcodes. Match defensively on message text as well.
        const lower = message.toLowerCase()
        if (lower.includes("already") && lower.includes("trigger")) {
          logger.warn(
            { syncType, phoneNumberId },
            "smb_app_data already triggered",
          )
          return { ok: false, reason: "already_triggered" } as const
        }
        if (
          lower.includes("window") ||
          lower.includes("expired") ||
          lower.includes("24 hour")
        ) {
          logger.warn(
            { syncType, phoneNumberId },
            "smb_app_data window expired",
          )
          return { ok: false, reason: "window_expired" } as const
        }
        logger.error({ code, subCode, message }, "smb_app_data unknown error")
      }
      throw error
    }
  })
}
