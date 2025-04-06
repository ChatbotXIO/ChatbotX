export interface WhatsappPhoneNumber {
  verified_name: string
  code_verification_status: string
  display_phone_number: string
  quality_rating: string
  platform_type: string
  id: string
}

export interface WhatsappPhoneNumberResponse {
  data: WhatsappPhoneNumber[]
}
