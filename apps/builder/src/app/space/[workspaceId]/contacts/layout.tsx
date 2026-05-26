import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import type { ReactNode } from "react"
import { ContactsAreaSidebar } from "@/features/contacts/components/contacts-area-sidebar"
import { countBlockedContacts } from "@/features/contacts/queries/count-blocked-contacts"
import { listLifecycleStages } from "@/features/lifecycle-stages/queries"

// Layout fixo da página /contacts (Pedro 2026-05-26): sidebar 215px à
// esquerda FIXO (não scrolla com page), conteúdo principal scrollável à
// direita. Mesma estrutura do /inbox/layout.tsx.
export default async function ContactsLayout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ workspaceId: string }>
}) {
  const workspaceId = getIdFromParams(await params, "workspaceId")
  if (!workspaceId) {
    return notFound()
  }

  const [lifecycleStages, blockedContactsCount] = await Promise.all([
    listLifecycleStages(workspaceId),
    countBlockedContacts(workspaceId),
  ])

  return (
    <div className="-m-6 flex h-[calc(100svh-0px)] flex-1">
      <ContactsAreaSidebar
        blockedContactsCount={blockedContactsCount}
        lifecycleStages={lifecycleStages}
        workspaceId={workspaceId}
      />
      <div className="flex flex-1 flex-col overflow-hidden">{children}</div>
    </div>
  )
}
