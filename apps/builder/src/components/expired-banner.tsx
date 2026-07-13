import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@chatbotx.io/ui/components/ui/alert"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { AlertTriangleIcon } from "lucide-react"
import Link from "next/link"
import { getTranslations } from "next-intl/server"

export async function ExpiredBanner({ blocked }: { blocked: boolean }) {
  if (!blocked) {
    return null
  }

  const t = await getTranslations("billing.trialExpired")

  return (
    <Alert className="border-amber-500/40 bg-amber-500/5" variant="warning">
      <AlertTriangleIcon />
      <AlertTitle>{t("bannerTitle")}</AlertTitle>
      <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p>{t("bannerDescription")}</p>
        <Button asChild className="shrink-0" size="sm" variant="outline">
          <Link href="/portal/pricing">{t("bannerCta")}</Link>
        </Button>
      </AlertDescription>
    </Alert>
  )
}
