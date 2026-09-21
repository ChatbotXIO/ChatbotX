import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"

export default async function ThreadsCommentsLayout({
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

  return children
}
