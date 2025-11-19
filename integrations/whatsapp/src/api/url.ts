import type { WhatsappAuthValue } from ".."
import { BUSINESS_URL } from "../constants"

export function getUrls(auth: WhatsappAuthValue) {
  return {
    addPaymentMethod: `${BUSINESS_URL}/billing_hub/accounts/details?business_id=${auth.metadata.businessId}&asset_id=${auth.metadata.wabaId}`,
    analytics: `${BUSINESS_URL}/wa/manage/insights/?business_id=${auth.metadata.businessId}&waba_id=${auth.metadata.wabaId}`,
    flows: `${BUSINESS_URL}/wa/manage/flows/?business_id=${auth.metadata.businessId}&waba_id=${auth.metadata.wabaId}`,
    linkCatalog: `${BUSINESS_URL}/wa/manage/catalog-linking?business_id=${auth.metadata.businessId}&waba_id=${auth.metadata.wabaId}`,
    paymentHistory: `${BUSINESS_URL}/billing_hub/payment_activity?business_id=${auth.metadata.businessId}&asset_id=${auth.metadata.wabaId}`,
    paymentMethods: `${BUSINESS_URL}/billing_hub/payment_methods?business_id=${auth.metadata.businessId}&asset_id=${auth.metadata.wabaId}`,
    phoneNumbers: `${BUSINESS_URL}/wa/manage/phone-numbers?business_id=${auth.metadata.businessId}&waba_id=${auth.metadata.wabaId}`,
    templates: `${BUSINESS_URL}/wa/manage/message-templates?business_id=${auth.metadata.businessId}&waba_id=${auth.metadata.wabaId}`,
    ecommerce: `${BUSINESS_URL}/commerce/get_started?business_id=${auth.metadata.businessId}`,
  }
}
