import {
  organizationCredentialService,
  organizationService,
} from "@chatbotx.io/business"
import { listPhoneNumbers as whatsappListPhoneNumbers } from "@chatbotx.io/integration-whatsapp/api/phone-number"
import { DEFAULT_API_VERSION } from "@chatbotx.io/integration-whatsapp/constants"
import { type NextRequest, NextResponse } from "next/server"
import { listPhoneNumbersRequest } from "@/features/integration-whatsapp/schemas"
import { getCurrentUserId } from "@/lib/auth/utils"
import { getDomainFromHeader } from "@/lib/domain"
import { serverErrorHandler } from "@/lib/errors/server-handler"

export async function POST(request: NextRequest) {
  try {
    await getCurrentUserId()

    const domain = await getDomainFromHeader()
    const organization = await organizationService.findByDomain(domain)
    const credential = await organizationCredentialService.find({
      organizationId: organization.id,
      type: "whatsapp",
    })
    const version = credential?.publicConfig.version ?? DEFAULT_API_VERSION

    const body = await request.json()
    const parsedBody = listPhoneNumbersRequest.parse(body)

    const phoneNumbers = await whatsappListPhoneNumbers({
      wabaId: parsedBody.wabaId,
      accessToken: parsedBody.accessToken,
      version,
    })

    return NextResponse.json(phoneNumbers)
  } catch (error) {
    return await serverErrorHandler(error)
  }
}
