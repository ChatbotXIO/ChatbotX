export type WhatsappPhoneNumber = {
  verified_name: string
  code_verification_status: string
  display_phone_number: string
  quality_rating: string
  platform_type: string
  id: string
}

export type WhatsappPhoneNumberResponse = {
  data: WhatsappPhoneNumber[]
}

export type FlowEntity = {
  id: string
  name: string
  status: string
  category: string[]
}

export type ListFlowsResponse = {
  data: FlowEntity[]
}
