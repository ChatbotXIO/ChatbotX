import { Button } from "@chatbotx.io/ui/components/ui/button"
import Link from "next/link"
import { getTranslations } from "next-intl/server"
import { SignOut } from "@/features/auth/sign-out"

export default async function TrialExpiredPage() {
  const t = await getTranslations("billing.trialExpired")

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-6 text-center">
      <div className="max-w-md space-y-3">
        <h1 className="font-bold text-2xl tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground">{t("description")}</p>
      </div>
      <div className="flex flex-col items-center gap-3">
        <Button asChild size="lg">
          <Link href="/pricing">{t("cta")}</Link>
        </Button>
        <SignOut />
      </div>
    </main>
  )
}
