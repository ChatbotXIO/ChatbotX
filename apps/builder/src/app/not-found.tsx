import { buttonVariants } from "@chatbotx.io/ui/components/ui/button"
import { HouseIcon } from "lucide-react"
import Link from "next/link"
import { getTranslations } from "next-intl/server"

export default async function NotFoundPage() {
  const t = await getTranslations()

  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-6 p-6 text-center">
      <p className="font-bold text-9xl text-muted-foreground/40 tabular-nums">
        404
      </p>

      <div className="flex max-w-md flex-col gap-2">
        <h1 className="font-semibold text-2xl tracking-tight">
          {t("notFound.title")}
        </h1>
        <p className="text-muted-foreground text-sm">
          {t("notFound.description")}
        </p>
      </div>

      <Link className={buttonVariants()} href="/">
        <HouseIcon className="size-4" />
        {t("notFound.backToHome")}
      </Link>
    </main>
  )
}
