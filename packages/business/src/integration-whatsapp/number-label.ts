import type { IntegrationWhatsappModel } from "@chatbotx.io/database/types"

type StoredPhoneNumber = {
  verified_name?: string
  display_phone_number?: string
}

/**
 * How a WhatsApp number is shown in a picker: "<verified name> · <number>",
 * read from the auth metadata stored at connect time, else its id. Never
 * exposes the rest of the auth blob.
 */
export const whatsappNumberLabel = (
  integration: Pick<IntegrationWhatsappModel, "id" | "auth">,
): string => {
  const phoneNumber = (
    integration.auth as { metadata?: { phoneNumber?: StoredPhoneNumber } }
  ).metadata?.phoneNumber
  const label = [phoneNumber?.verified_name, phoneNumber?.display_phone_number]
    .filter(Boolean)
    .join(" · ")
  return label || integration.id
}
