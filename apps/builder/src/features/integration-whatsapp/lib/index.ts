import ky from "ky"
import { logger } from "@/lib/log"

type WhatsappPhoneNumber = {
  id: string
  display_phone_number: string
  verified_name: string
}

type WhatsappPhoneNumberResponse = {
  phoneNumberId: string
  phoneNumber: string
  verifiedName: string
}

export async function listPhoneNumbers(
  wabaId: string,
  accessToken: string,
): Promise<WhatsappPhoneNumberResponse[]> {
  try {
    const response = await ky
      .get<{ data: WhatsappPhoneNumber[] }>(
        `https://graph.facebook.com/v23.0/${wabaId}/phone_numbers?access_token=${accessToken}`,
      )
      .json()

    return response.data.map((phoneNumber) => ({
      phoneNumberId: phoneNumber.id,
      phoneNumber: phoneNumber.display_phone_number,
      verifiedName: phoneNumber.verified_name,
    }))
  } catch (error) {
    logger.error("Unable to list whatsapp phone numbers", { error })

    throw new Error("Unable to list whatsapp phone numbers")
  }
}
