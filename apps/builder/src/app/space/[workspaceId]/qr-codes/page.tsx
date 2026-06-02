import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import type { SearchParams } from "nuqs/server"
import { Suspense } from "react"
import { AppBreadcrumb } from "@/components/app-breadcrumb"
import { FlowStoreProvider } from "@/features/flows/provider/flow-store-context"
import { QrCodesTable } from "@/features/qr-codes/qr-codes-table"
import { listQrCodes } from "@/features/qr-codes/queries"
import { listQrCodesSearchParamsCache } from "@/features/qr-codes/schemas/query"

export default async function QrCodesPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string }>
  searchParams: Promise<SearchParams>
}) {
  const workspaceId = getIdFromParams(await params, "workspaceId")
  if (!workspaceId) {
    return notFound()
  }

  const t = await getTranslations()

  const search = listQrCodesSearchParamsCache.parse(await searchParams)

  const promises = Promise.all([
    listQrCodes({
      ...search,
      workspaceId,
    }),
  ])

  return (
    <div className="flex flex-col gap-4">
      <AppBreadcrumb
        items={[
          {
            label: t("tools.title"),
            href: `/space/${workspaceId}/tools`,
          },
          { label: t("qrCodes.title"), href: "" },
        ]}
      />
      <FlowStoreProvider workspaceId={workspaceId}>
        <Suspense fallback={<div>Loading...</div>}>
          <QrCodesTable promises={promises} workspaceId={workspaceId} />
        </Suspense>
      </FlowStoreProvider>
    </div>
  )
}
