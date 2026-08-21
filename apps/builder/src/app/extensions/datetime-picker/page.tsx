import { workspaceService } from "@chatbotx.io/business"
import { verifyUserDataWebviewToken } from "@chatbotx.io/encryption"
import type { Metadata } from "next"
import { notFound } from "next/navigation"
import Script from "next/script"
import { NextIntlClientProvider } from "next-intl"
import { getTranslations } from "next-intl/server"
import { DateTimePickerForm } from "@/features/get-user-data-webview/components/date-time-picker-form"
import { loadWorkspaceMessages } from "@/i18n/workspace-locale"
import { loadServableWorkspace } from "@/lib/workspace/load-servable-workspace"

export const runtime = "nodejs"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("userDataWebview")
  return {
    title: t("metadataTitle"),
  }
}

type DateTimePickerPageProps = {
  searchParams: Promise<{ token?: string }>
}

export default async function DateTimePickerPage({
  searchParams,
}: DateTimePickerPageProps) {
  const t = await getTranslations("userDataWebview")
  const token = (await searchParams).token
  if (!token) {
    return (
      <PublicMessage
        description={t("errors.invalidTokenDescription")}
        title={t("errors.invalidTokenTitle")}
      />
    )
  }

  let payload: Awaited<ReturnType<typeof verifyUserDataWebviewToken>>
  try {
    payload = await verifyUserDataWebviewToken(token)
  } catch {
    return (
      <PublicMessage
        description={t("errors.invalidTokenDescription")}
        title={t("errors.invalidTokenTitle")}
      />
    )
  }

  // notFound() throws internally — this must run outside the token-verify
  // try/catch above, otherwise the generic catch would swallow it and render
  // the "invalid token" message instead of a real 404.
  const { servable } = await loadServableWorkspace(payload.workspaceId)
  if (!servable) {
    return notFound()
  }

  const workspace = await workspaceService.findById({
    id: payload.workspaceId,
  })
  const { locale, messages } = await loadWorkspaceMessages(workspace.language)

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <Script
        src="https://connect.facebook.net/en_US/messenger.Extensions.js"
        strategy="afterInteractive"
      />
      <DateTimePickerForm mode={payload.replyFormat} token={token} />
    </NextIntlClientProvider>
  )
}

function PublicMessage({
  title,
  description,
}: {
  title: string
  description: string
}) {
  return (
    <div className="flex min-h-screen items-center justify-center p-6 text-center">
      <div className="max-w-md space-y-2">
        <h1 className="font-semibold text-2xl">{title}</h1>
        <p className="text-muted-foreground text-sm">{description}</p>
      </div>
    </div>
  )
}
