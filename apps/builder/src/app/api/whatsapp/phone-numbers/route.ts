import { NextResponse } from "next/server"
import { listPhoneNumbers } from "@/features/integration-whatsapp/lib"
import { listPhoneNumbersRequest } from "@/features/integration-whatsapp/schemas"
import { getCurrentUserId } from "@/lib/auth"

export async function GET(request: Request) {
  await getCurrentUserId()

  const body = await request.json()
  const parsedBody = listPhoneNumbersRequest.parse(body)

  const phoneNumbers = await listPhoneNumbers(
    parsedBody.wabaId,
    parsedBody.accessToken,
  )

  return NextResponse.json({
    data: phoneNumbers,
  })
}
