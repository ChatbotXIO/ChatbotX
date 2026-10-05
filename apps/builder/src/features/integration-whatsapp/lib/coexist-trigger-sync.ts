import type { SetCoexistTriggerSync } from "@chatbotx.io/business"
import { triggerSmbAppDataSync } from "@chatbotx.io/integration-whatsapp/api/coexists"

/**
 * Provider-facing sync trigger, built from the primitives the business
 * service hands back (accessToken/version/phoneNumberId/syncType) — the
 * builder layer is the only one allowed to depend on
 * `@chatbotx.io/integration-whatsapp`, so `setCoexist` (business) never does.
 */
export const triggerSync: SetCoexistTriggerSync = ({
  accessToken,
  version,
  phoneNumberId,
  syncType,
}) =>
  triggerSmbAppDataSync({
    auth: { tokens: { accessToken }, version },
    phoneNumberId,
    syncType,
  })
