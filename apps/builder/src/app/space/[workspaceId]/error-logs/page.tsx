import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import type { SearchParams } from "nuqs/server"
import { Suspense } from "react"
import { ErrorLogsTable } from "@/features/error-logs/error-logs-table"
import { listErrorLogs } from "@/features/error-logs/queries"
import { listErrorLogsSearchParamsCache } from "@/features/error-logs/schemas/query"

export default async function ErrorLogsPage(props: {
  params: Promise<{ workspaceId: string }>
  searchParams: Promise<SearchParams>
}) {
  const workspaceId = getIdFromParams(await props.params, "workspaceId")
  if (!workspaceId) {
    return notFound()
  }

  const searchParams = await props.searchParams
  const search = listErrorLogsSearchParamsCache.parse(searchParams)

  const promises = Promise.all([
    listErrorLogs({
      ...search,
      workspaceId,
    }),
  ])

  // AppTab removido — Logs de Erro agora aparece no sub-sidebar de
  // Configurações em vez de tabs na aba Fluxos.
  return (
    <Suspense>
      <ErrorLogsTable promises={promises} workspaceId={workspaceId} />
    </Suspense>
  )
}
