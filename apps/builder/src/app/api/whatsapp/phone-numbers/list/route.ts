import { platformCredentialService } from "@chatbotx.io/business"
import { listPhoneNumbers as whatsappListPhoneNumbers } from "@chatbotx.io/integration-whatsapp/api/phone-number"
import { DEFAULT_API_VERSION } from "@chatbotx.io/integration-whatsapp/constants"
import { type NextRequest, NextResponse } from "next/server"
import { listPhoneNumbersRequest } from "@/features/integration-whatsapp/schemas"
import { getCurrentUserId } from "@/lib/auth/utils"
import { serverErrorHandler } from "@/lib/errors/server-handler"
import { resolvePlatformOwnerId } from "@/lib/platform-credential-owner"

export async function POST(request: NextRequest) {
  try {
    const userId = await getCurrentUserId()
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    // Host-derived, not the bare current user: a reseller operator on their
    // white-label domain must read phone numbers with the same app `version`
    // `connect.action.ts` uses to connect them, or the two disagree on the
    // same WABA.
    const ownerId = await resolvePlatformOwnerId({ userId })
    const credential = await platformCredentialService.resolveForOwner({
      ownerId,
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
