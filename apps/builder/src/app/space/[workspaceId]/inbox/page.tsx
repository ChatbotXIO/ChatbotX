import { getIdFromParams } from "@chatbotx.io/utils"
import { Loader2Icon } from "lucide-react"
import { cookies } from "next/headers"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { FullBleed } from "@/components/full-bleed"
import { ChatLayout } from "@/features/chat/chat-layout"
import { getInboxInitialState } from "@/features/chat/queries/get-inbox-initial-state.query"
import { ChatStoreProvider } from "@/features/chat/store/chat-store-provider"
import {
  buildContactPermissionScope,
  type ContactPermissionScope,
} from "@/features/contacts/permissions"
import { requireContactsAccess } from "@/lib/auth/require-workspace-permission"
import { getCurrentUserAndTargetWorkspace } from "@/lib/auth/utils"
import { logger } from "@/lib/log"
import {
  conversationAccessCheckForCaller,
  type MemberScopeContext,
} from "@/lib/public-api/member-scope"

type InboxPageProps = {
  params: Promise<{ workspaceId: string }>
  searchParams?: Promise<{ conversationId?: string }>
}

export default async function InboxPage({
  params,
  searchParams,
}: InboxPageProps) {
  const workspaceId = getIdFromParams(await params, "workspaceId")
  if (!workspaceId) {
    return notFound()
  }

  await requireContactsAccess(workspaceId)

  const layout = (await cookies()).get("csm:layout:inbox")
  const savedLayout = layout ? JSON.parse(layout.value) : [25, 50, 25]
  const userAndWorkspace = await getCurrentUserAndTargetWorkspace(workspaceId)
  if (!userAndWorkspace) {
    return notFound()
  }
  const { user, targetWorkspaceMember } = userAndWorkspace
  const contactPermissionScope = buildContactPermissionScope({
    permissions: targetWorkspaceMember.permissions,
    userId: user.id,
  })
  if (!contactPermissionScope) {
    return notFound()
  }

  const conversationId = (await searchParams)?.conversationId

  return (
    <FullBleed>
      <Suspense
        fallback={
          <div className="flex min-h-0 flex-1 items-center justify-center">
            <Loader2Icon className="animate-spin" />
          </div>
        }
      >
        <InboxContent
          canViewEmailAndPhone={contactPermissionScope.canViewEmailAndPhone}
          contactPermissionScope={contactPermissionScope}
          conversationId={conversationId}
          layout={savedLayout}
          memberScope={{
            workspace: { id: workspaceId },
            member: targetWorkspaceMember,
            user,
          }}
          workspaceId={workspaceId}
        />
      </Suspense>
    </FullBleed>
  )
}

async function InboxContent({
  canViewEmailAndPhone,
  contactPermissionScope,
  conversationId,
  layout,
  memberScope,
  workspaceId,
}: {
  canViewEmailAndPhone: boolean
  contactPermissionScope: ContactPermissionScope
  conversationId?: string
  layout: [number, number, number]
  memberScope: MemberScopeContext
  workspaceId: string
}) {
  // Hides seeded translations of conversations outside the member's scope. If
  // the scope cannot be resolved, the seed carries no translation at all
  // rather than failing the Inbox.
  const canSeeConversation = await conversationAccessCheckForCaller(
    memberScope,
  ).catch((err: unknown) => {
    logger.warn(
      { err, workspaceId },
      "Inbox: failed to resolve the member's conversation scope",
    )
    return async () => false
  })
  const initialState = await getInboxInitialState({
    workspaceId,
    conversationId,
    contactPermissionScope,
    canSeeConversation,
  })

  return (
    <ChatStoreProvider initialState={initialState ?? undefined}>
      <ChatLayout
        canViewEmailAndPhone={canViewEmailAndPhone}
        layout={layout}
        workspaceId={workspaceId}
      />
    </ChatStoreProvider>
  )
}
