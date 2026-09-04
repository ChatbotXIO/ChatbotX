import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@chatbotx.io/ui/components/ui/alert"
import { ShieldCheckIcon } from "lucide-react"
import { getTranslations } from "next-intl/server"

export async function SupportAccessBanner({
  supportAccessUntil,
}: {
  supportAccessUntil: Date | null
}) {
  const t = await getTranslations("workspace.supportAccess")
  const time = supportAccessUntil?.toLocaleString() ?? ""

  return (
    <Alert variant="default">
      <ShieldCheckIcon />
      <AlertTitle>{t("bannerTitle")}</AlertTitle>
      <AlertDescription>{t("bannerDescription", { time })}</AlertDescription>
    </Alert>
  )
}
