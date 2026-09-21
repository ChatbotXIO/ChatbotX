import { getIdFromParams } from "@chatbotx.io/utils"
import { Loader2Icon } from "lucide-react"
import { cookies } from "next/headers"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { FullBleed } from "@/components/full-bleed"
import { ChatLayout } from "@/features/chat/chat-layout"
import { getInboxInitialState } from "@/features/chat/queries/get-inbox-initial-state.query"
import { ChatStoreProvider } from "@/features/chat/store/chat-store-provider"
import { canViewContactEmailAndPhone } from "@/features/contacts/permissions"
import { requireContactsAccess } from "@/lib/auth/require-workspace-permission"
import { getCurrentUserAndTargetWorkspace } from "@/lib/auth/utils"

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
  const canViewEmailAndPhone = canViewContactEmailAndPhone(
    targetWorkspaceMember.permissions,
  )
  const contactPermissionScope: ContactPermissionScope = {
    canViewEmailAndPhone,
    restrictToAssignedUserId: getAssignedContactsUserId({
      permissions: targetWorkspaceMember.permissions,
      userId: user.id,
    }),
  }

  const conversationId = (await searchParams)?.conversationId

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
          canViewEmailAndPhone={canViewEmailAndPhone}

          conversationId={conversationId}
          layout={savedLayout}
          workspaceId={workspaceId}
        />
      </Suspense>
    </FullBleed>
  )
}

async function InboxContent({
  canViewEmailAndPhone,

  conversationId,
  layout,
  workspaceId,
}: {
  canViewEmailAndPhone: boolean

  conversationId?: string
  layout: [number, number, number]
  workspaceId: string
}) {
  const initialState = await getInboxInitialState({
    workspaceId,
    conversationId,
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
