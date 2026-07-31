import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@chatbotx.io/ui/components/ui/alert"
import { buttonVariants } from "@chatbotx.io/ui/components/ui/button"
import { AlertTriangleIcon } from "lucide-react"
import Link from "next/link"
import { getTranslations } from "next-intl/server"

interface ExpiredBannerProps {
  blocked: boolean
  /** Why access is blocked; picks the banner copy. Defaults to the plan/trial message. */
  reason?: "status" | "mac" | null
}

export async function ExpiredBanner({ blocked, reason }: ExpiredBannerProps) {
  if (!blocked) {
    return null
  }

  const t = await getTranslations(
    reason === "mac" ? "billing.macLimitReached" : "billing.trialExpired",
  )

  return (
    <Alert className="border-amber-500/40 bg-amber-500/5" variant="warning">
      <AlertTriangleIcon />
      <AlertTitle>{t("bannerTitle")}</AlertTitle>
      <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p>{t("bannerDescription")}</p>
        <Link
          className={buttonVariants({ variant: "outline", size: "sm" })}
          href="/portal/pricing"
        >
          {t("bannerCta")}
        </Link>
      </AlertDescription>
    </Alert>
  )
}
