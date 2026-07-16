import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@chatbotx.io/ui/components/ui/alert"
import { AlertTriangleIcon } from "lucide-react"
import { getTranslations } from "next-intl/server"

export async function ScheduledDeletionBanner({
  scheduled,
}: {
  scheduled: boolean
}) {
  if (!scheduled) {
    return null
  }

  const t = await getTranslations("workspace.deletion")

  return (
    <Alert variant="warning">
      <AlertTriangleIcon />
      <AlertTitle>{t("bannerTitle")}</AlertTitle>
      <AlertDescription>{t("bannerDescription")}</AlertDescription>
    </Alert>
  )
}
