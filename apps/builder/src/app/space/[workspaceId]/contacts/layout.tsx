import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import type { ReactNode } from "react"
import { listInboxTeams } from "@/enterprise/features/inbox-teams/queries"
import { InboxSidebarExpandButton } from "@/features/chat/components/inbox-sidebar-expand-button"
import { ChatStoreProvider } from "@/features/chat/store/chat-store-provider"
import { ContactsAreaSidebar } from "@/features/contacts/components/contacts-area-sidebar"
import { countBlockedContacts } from "@/features/contacts/queries/count-blocked-contacts"
import { CustomFieldStoreProvider } from "@/features/custom-fields/provider/custom-field-store-context"
import { InboxStoreProvider } from "@/features/inboxes/provider/inbox-store-context"
import {
  countOpenConversationsByAssignment,
  countOpenConversationsByLifecycle,
  countUnreadConversationsByAssignment,
  countUnreadConversationsByLifecycle,
  listLifecycleStages,
} from "@/features/lifecycle-stages/queries"
import { TagStoreProvider } from "@/features/tags/provider/tag-store-context"
import { UserStoreProvider } from "@/features/users/provider/user-store-context"
import { getCurrentUserId } from "@/lib/auth/utils"

// Layout da página /contacts (Pedro 2026-05-26): sidebar lateral fixo
// literalmente o mesmo do Inbox (mesmo visual + mesmos items: Caixas,
// Times, Ciclo de vida, Bloqueados footer). Toda a árvore de Providers
// (ChatStore, InboxStore, TagStore, UserStore, CustomFieldStore) é
// idêntica à do /inbox/layout.tsx — pra que o drawer "Detalhes do
// contato" reuse o componente <ContactDetail> FULL (com inline edit,
// custom fields, accordion hidden, tags reais).
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

  const userId = await getCurrentUserId()
  if (!userId) {
    return notFound()
  }

  const [{ data: inboxTeams }, lifecycleStages] = await Promise.all([
    listInboxTeams({ workspaceId }),
    listLifecycleStages(workspaceId),
  ])
  const teamIds = (inboxTeams ?? []).map((t) => t.id)
  const [
    lifecycleCounts,
    assignmentCounts,
    unreadByStage,
    unreadByAssignment,
    blockedContactsCount,
  ] = await Promise.all([
    countOpenConversationsByLifecycle(workspaceId),
    countOpenConversationsByAssignment(workspaceId, userId, teamIds),
    countUnreadConversationsByLifecycle(workspaceId),
    countUnreadConversationsByAssignment(workspaceId, userId, teamIds),
    countBlockedContacts(workspaceId),
  ])

  return (
    <div className="-m-6 flex h-[calc(100svh-0px)] flex-1">
      <ChatStoreProvider>
        <InboxStoreProvider workspaceId={workspaceId}>
          <UserStoreProvider workspaceId={workspaceId}>
            <CustomFieldStoreProvider workspaceId={workspaceId}>
              <TagStoreProvider workspaceId={workspaceId}>
                <ContactsAreaSidebar
                  assignmentCounts={assignmentCounts}
                  blockedContactsCount={blockedContactsCount}
                  currentUserId={userId}
                  inboxTeams={inboxTeams ?? []}
                  lifecycleCounts={lifecycleCounts}
                  lifecycleStages={lifecycleStages}
                  unreadByAssignment={unreadByAssignment}
                  unreadByStage={unreadByStage}
                  workspaceId={workspaceId}
                />
                <InboxSidebarExpandButton />
                <div className="flex flex-1 flex-col overflow-hidden">
                  {children}
                </div>
              </TagStoreProvider>
            </CustomFieldStoreProvider>
          </UserStoreProvider>
        </InboxStoreProvider>
      </ChatStoreProvider>
    </div>
  )
}
