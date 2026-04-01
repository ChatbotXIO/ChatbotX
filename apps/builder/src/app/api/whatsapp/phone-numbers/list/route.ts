import { listPhoneNumbers as whatsappListPhoneNumbers } from "@chatbotx.io/integration-whatsapp/api/phone-number"
import { type NextRequest, NextResponse } from "next/server"
import { listPhoneNumbersRequest } from "@/features/integration-whatsapp/schemas"
import { findOrganizationSettingsByKey } from "@/features/organization/queries"
import { getCurrentUserId } from "@/lib/auth/utils"
import { getDomainFromHeader } from "@/lib/domain"
import { serverErrorHandler } from "@/lib/errors/server-handler"

export async function POST(request: NextRequest) {
  try {
    await getCurrentUserId()

    const domain = await getDomainFromHeader()
    const whatsappSettings = await findOrganizationSettingsByKey(
      {
        domain,
      },
      "whatsapp",
    )

    const body = await request.json()
    const parsedBody = listPhoneNumbersRequest.parse(body)

    const phoneNumbers = await whatsappListPhoneNumbers({
      wabaId: parsedBody.wabaId,
      accessToken: parsedBody.accessToken,
      version: whatsappSettings.version,
    })

    return NextResponse.json(phoneNumbers)
  } catch (error) {
    return await serverErrorHandler(error)
  }
}
