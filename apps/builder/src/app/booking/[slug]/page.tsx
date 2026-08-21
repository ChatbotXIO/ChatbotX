import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("bookingPage")
  return {
    title: t("metadataTitle"),
  }
}

export default async function BookingPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  await params
  const t = await getTranslations("bookingPage")

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-2 p-6 text-center">
      <h1 className="font-semibold text-xl">{t("comingSoonTitle")}</h1>
      <p className="text-muted-foreground">{t("comingSoonDescription")}</p>
    </div>
  )
}
