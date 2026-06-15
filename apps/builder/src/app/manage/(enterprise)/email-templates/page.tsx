import { tenantService } from "@chatbotx.io/business"
import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { PlatformEmailTemplatesSettings } from "@/enterprise/features/platform-email-templates/platform-email-templates-settings"
import { getCurrentUserId } from "@/lib/auth/utils"

export default async function ManageEmailTemplatesPage() {
  const t = await getTranslations()

  const userId = await getCurrentUserId()

  if (!userId) {
    return notFound()
  }

  const setting = await tenantService.findByOwner(userId)

  return (
    <div className="space-y-4">
      <h3 className="font-bold text-lg sm:text-xl">
        {t("platformEmailTemplates.title")}
      </h3>

      <PlatformEmailTemplatesSettings setting={setting} />
    </div>
  )
}
