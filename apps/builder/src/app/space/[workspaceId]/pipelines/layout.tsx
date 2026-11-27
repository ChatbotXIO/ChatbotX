import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { requireContactsAccess } from "@/lib/auth/require-workspace-permission"

export default async function PipelinesLayout({
  children,
  params,
}: {
  params: Promise<{ workspaceId: string }>
  children: React.ReactNode
}) {
  const workspaceId = getIdFromParams(await params, "workspaceId")
  if (!workspaceId) {
    notFound()
  }
  // Same bar as Contacts and Inbox (including assigned-contacts-only members),
  // so the sidebar entry and the page never disagree.
  await requireContactsAccess(workspaceId)

  return children
}
