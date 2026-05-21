import { contactService, verifyUnsubscribeToken } from "@chatbotx.io/business"
import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"

export const metadata: Metadata = {
  title: "Unsubscribe",
}

type UnsubscribePageProps = {
  searchParams: Promise<{ token?: string }>
}

export default async function UnsubscribePage(props: UnsubscribePageProps) {
  const { token } = await props.searchParams
  const t = await getTranslations("unsubscribePage")

  if (!token) {
    return (
      <UnsubscribeMessage
        description={t("invalidDescription")}
        title={t("invalidTitle")}
      />
    )
  }

  try {
    const payload = await verifyUnsubscribeToken(token)
    await contactService.unsubscribeEmail(payload.cid)
  } catch {
    return (
      <UnsubscribeMessage
        description={t("invalidDescription")}
        title={t("invalidTitle")}
      />
    )
  }

  return (
    <UnsubscribeMessage description={t("description")} title={t("title")} />
  )
}

function UnsubscribeMessage({
  title,
  description,
}: {
  title: string
  description: string
}) {
  return (
    <div className="flex h-screen w-screen items-center justify-center">
      <div className="max-w-sm text-center">
        <h1 className="font-semibold text-xl">{title}</h1>
        <p className="mt-2 text-muted-foreground">{description}</p>
      </div>
    </div>
  )
}
