import { contactService } from "@chatbotx.io/business"
import { verifyUnsubscribeToken } from "@chatbotx.io/encryption"
import { type NextRequest, NextResponse } from "next/server"
import { getTranslations } from "next-intl/server"

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token")
  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 })
  }

  let payload: { cid: string; wid: string }
  try {
    payload = await verifyUnsubscribeToken(token)
  } catch {
    return NextResponse.json({ error: "Invalid token" }, { status: 403 })
  }

  contactService.unsubscribeEmail(payload.cid)

  const t = await getTranslations("unsubscribePage")

  return new NextResponse(
    `<!doctype html><html><head><meta charset="utf-8">
     <title>${t("title")}</title></head><body style="font-family:sans-serif;padding:2rem">
     <h1>${t("title")}</h1>
     <p>${t("description")}</p>
     </body></html>`,
    { headers: { "Content-Type": "text/html" } },
  )
}
