import { tenantService } from "@chatbotx.io/business"
import { notFound } from "next/navigation"
import { getCurrentUser } from "@/lib/auth/utils"

export async function requireActiveReseller(): Promise<void> {
  const user = await getCurrentUser()
  const tenant = user ? await tenantService.findByOwner(user.id) : undefined
  if (tenant?.status !== "active") {
    notFound()
  }
}
