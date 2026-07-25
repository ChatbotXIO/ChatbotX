import { systemFieldService } from "@chatbotx.io/business/system-field"
import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { NextIntlClientProvider } from "next-intl"
import { MeDataView } from "@/features/system-fields/components/me-data-view"
import {
  parseMeLinkInput,
  toMePrivacyParams,
} from "@/features/system-fields/lib/me-link-params"
import { loadWorkspaceMessages } from "@/i18n/workspace-locale"
import { loadServableWorkspace } from "@/lib/workspace/load-servable-workspace"

export const metadata: Metadata = {
  title: "Privacy",
}

export const runtime = "nodejs"

type MePageProps = {
  searchParams: Promise<{
    w?: string
    u?: string
    ib?: string
    id?: string
    hash?: string
  }>
}

export default async function MePage(props: MePageProps) {
  const input = parseMeLinkInput(await props.searchParams)
  if (!input) {
    return null
  }

  const { servable } = await loadServableWorkspace(input.w)
  if (!servable) {
    return notFound()
  }

  const data = await systemFieldService.getMePrivacyData(
    toMePrivacyParams(input),
  )
  if (!data) {
    return null
  }

  const { locale, messages } = await loadWorkspaceMessages(data.language)

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <MeDataView data={data} />
    </NextIntlClientProvider>
  )
}
