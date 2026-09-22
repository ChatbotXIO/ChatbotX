import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"

import { FlowStoreProvider } from "@/features/flows/provider/flow-store-context"

export default async function IgCommentsLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ workspaceId: string }>
}) {
  const workspaceId = getIdFromParams(await params, "workspaceId")
  if (!workspaceId) {
    return notFound()
  }

  return <FlowStoreProvider>{children}</FlowStoreProvider>
}
