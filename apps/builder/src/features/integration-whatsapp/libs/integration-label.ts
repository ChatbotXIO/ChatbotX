/**
 * Display label for a WhatsApp integration in account selects — "name — phone"
 * when the number is known, since a workspace commonly connects several
 * numbers under similar names. Shared by the Ads dashboard's channel select
 * (`features/ads/lib/resolve-channel-integrations.ts`) and the Click to
 * Message Ads tool (`features/ads-campaign/queries/tool-integrations.ts`) so
 * the two surfaces cannot drift.
 */
export function formatWhatsappIntegrationLabel(integration: {
  name: string
  displayPhoneNumber: string | null
}): string {
  return integration.displayPhoneNumber
    ? `${integration.name} — ${integration.displayPhoneNumber}`
    : integration.name
}
