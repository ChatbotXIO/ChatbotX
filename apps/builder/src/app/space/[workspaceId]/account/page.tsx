import { UserIcon } from "lucide-react"
import { getTranslations } from "next-intl/server"
import { ProfileForm } from "@/features/account/profile-form"

export default async function ProfilePage() {
  const t = await getTranslations("personalSettings.profileSection")
  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 font-semibold text-foreground text-xl">
          <UserIcon className="size-5" />
          {t("title")}
        </h1>
        <p className="mt-1 text-sm text-text-secondary">{t("subtitle")}</p>
      </div>
      <ProfileForm />
    </div>
  )
}
