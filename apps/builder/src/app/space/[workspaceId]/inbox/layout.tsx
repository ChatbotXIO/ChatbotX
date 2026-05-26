import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import type { ReactNode } from "react"
import { InboxAreaSidebar } from "@/components/inbox-area-sidebar"
import { listInboxTeams } from "@/enterprise/features/inbox-teams/queries"
import { InboxSidebarExpandButton } from "@/features/chat/components/inbox-sidebar-expand-button"
import { ChatStoreProvider } from "@/features/chat/store/chat-store-provider"
import { countBlockedContacts } from "@/features/contacts/queries/count-blocked-contacts"
import { CustomFieldStoreProvider } from "@/features/custom-fields/provider/custom-field-store-context"
import { FlowStoreProvider } from "@/features/flows/provider/flow-store-context"
import { InboxStoreProvider } from "@/features/inboxes/provider/inbox-store-context"
import {
  countOpenConversationsByAssignment,
  countOpenConversationsByLifecycle,
  countUnreadConversationsByAssignment,
  countUnreadConversationsByLifecycle,
  listLifecycleStages,
} from "@/features/lifecycle-stages/queries"
import { SavedReplyStoreProvider } from "@/features/saved-replies/provider/saved-reply-store-context"
import { TagStoreProvider } from "@/features/tags/provider/tag-store-context"
import { UserStoreProvider } from "@/features/users/provider/user-store-context"
import { getCurrentUserId } from "@/lib/auth/utils"

export default async function InboxLayout({
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

  // Carrega tudo paralelo. Os badges do sidebar mostram CONVERSAS ABERTAS
  // (não contatos) pra alinhar com Respond.io (docs:
  // markdown-raw/inbox/getting-started-with-inbox.md).
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
              <SavedReplyStoreProvider
                autoInitialize={false}
                workspaceId={workspaceId}
              >
                <TagStoreProvider workspaceId={workspaceId}>
                  <FlowStoreProvider workspaceId={workspaceId}>
                    <InboxAreaSidebar
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
                    <div className="flex flex-1 overflow-hidden">
                      {children}
                    </div>
                  </FlowStoreProvider>
                </TagStoreProvider>
              </SavedReplyStoreProvider>
            </CustomFieldStoreProvider>
          </UserStoreProvider>
        </InboxStoreProvider>
      </ChatStoreProvider>
    </div>
  )
}
