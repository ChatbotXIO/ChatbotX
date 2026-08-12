import { getIdFromParams } from "@chatbotx.io/utils"
import type { SearchParams } from "nuqs/server"
import { Suspense } from "react"
import { ConnectAccountsView } from "@/features/ads/components/connect-accounts-view"
import { getConnectAccountsData } from "@/features/ads/queries/connect-accounts"
import { connectAccountsSearchParamsCache } from "@/features/ads/schemas/connect-accounts"

export default async function ConnectAccountsPage(props: {
  params: Promise<{ workspaceId: string }>
  searchParams: Promise<SearchParams>
}) {
  const workspaceId = getIdFromParams(await props.params, "workspaceId")
  const search = connectAccountsSearchParamsCache.parse(
    await props.searchParams,
  )
  const promises = Promise.all([getConnectAccountsData(workspaceId)])

  return (
    <Suspense>
      <ConnectAccountsView
        promises={promises}
        selectedAccount={search.account}
        workspaceId={workspaceId}
      />
    </Suspense>
  )
}
