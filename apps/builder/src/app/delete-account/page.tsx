import { buttonVariants } from "@chatbotx.io/ui/components/ui/button"
import type { Metadata } from "next"
import Link from "next/link"
import { getTranslations } from "next-intl/server"
import type { ReactNode } from "react"

export const metadata: Metadata = {
  title: "Delete your account",
}

const SUPPORT_EMAIL = "support@chatbotx.io"

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="font-semibold text-lg">{title}</h2>
      {children}
    </section>
  )
}

export default async function DeleteAccountInfoPage() {
  const t = await getTranslations("deleteAccountPage")

  return (
    <main className="mx-auto flex min-h-svh max-w-2xl flex-col gap-8 px-6 py-12">
      <header className="space-y-2">
        <h1 className="font-semibold text-3xl">{t("title")}</h1>
        <p className="text-muted-foreground">{t("intro")}</p>
      </header>

      <Section title={t("waysTitle")}>
        <ol className="list-decimal space-y-3 ps-5">
          <li>{t("wayMobile")}</li>
          <li className="space-y-2">
            <p>{t("wayWeb")}</p>
            <Link
              className={buttonVariants({ variant: "outline" })}
              href="/account/delete"
            >
              {t("wayWebLink")}
            </Link>
          </li>
          <li>{t("wayEmail", { email: SUPPORT_EMAIL })}</li>
        </ol>
      </Section>

      <Section title={t("whatHappensTitle")}>
        <p>{t("whatHappens")}</p>
      </Section>

      <Section title={t("deletedTitle")}>
        <p>{t("deleted")}</p>
        <p>{t("sharedWorkspace")}</p>
      </Section>

      <Section title={t("retainedTitle")}>
        <p>{t("retained")}</p>
      </Section>
    </main>
  )
}
