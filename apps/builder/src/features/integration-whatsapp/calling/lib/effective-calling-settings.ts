import type { WhatsappCallingSettings } from "@chatbotx.io/integration-whatsapp/api/calling"

/**
 * Calling is on only when both Meta's number-level `status` and the
 * workspace's own `callingEnabled` are on. Showing Meta's status alone would
 * render "on" for a number whose calls are still refused.
 */
export const resolveEffectiveCallingSettings = (
  settings: WhatsappCallingSettings,
  workspaceCallingEnabled: boolean | null,
): WhatsappCallingSettings =>
  workspaceCallingEnabled === true
    ? settings
    : { ...settings, status: "DISABLED" }
