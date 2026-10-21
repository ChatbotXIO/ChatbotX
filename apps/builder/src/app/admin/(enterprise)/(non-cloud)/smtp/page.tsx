import { getTranslations } from "next-intl/server"
import { PlatformSmtpForm } from "@/enterprise/features/platform-smtp/platform-smtp-form"
import { getPlatformSmtpSettings } from "@/enterprise/features/platform-smtp/queries"

export default async function AdminPlatformSmtpPage() {
  const [t, settings] = await Promise.all([
    getTranslations(),
    getPlatformSmtpSettings(),
  ])

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h3 className="font-bold text-lg sm:text-xl">
          {t("platformAdmin.smtp.title")}
        </h3>
        <p className="text-muted-foreground text-sm">
          {t("platformAdmin.smtp.description")}
        </p>
      </div>

      <PlatformSmtpForm settings={settings} />
    </div>
  )
}
