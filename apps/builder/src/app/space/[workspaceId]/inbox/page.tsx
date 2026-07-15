import { getIdFromParams } from "@chatbotx.io/utils"
import { cookies } from "next/headers"
import { notFound } from "next/navigation"
import { ChatLayout } from "@/features/chat/chat-layout"
import { ChatStoreProvider } from "@/features/chat/store/chat-store-provider"
import { canViewContactEmailAndPhone } from "@/features/contacts/permissions"
import { CustomFieldStoreProvider } from "@/features/custom-fields/provider/custom-field-store-context"
import { FlowStoreProvider } from "@/features/flows/provider/flow-store-context"
import { InboxStoreProvider } from "@/features/inboxes/provider/inbox-store-context"
import { SavedReplyStoreProvider } from "@/features/saved-replies/provider/saved-reply-store-context"
import { SequenceStoreProvider } from "@/features/sequences/provider/sequence-store-context"
import { TagStoreProvider } from "@/features/tags/provider/tag-store-context"
import { UserStoreProvider } from "@/features/users/provider/user-store-context"
import { getCurrentUserAndTargetWorkspace } from "@/lib/auth/utils"

type InboxPageProps = {
  params: Promise<{ workspaceId: string }>
}

export default async function InboxPage({ params }: InboxPageProps) {
  const workspaceId = getIdFromParams(await params, "workspaceId")
  if (!workspaceId) {
    return notFound()
  }

  const layout = (await cookies()).get("csm:layout:inbox")
  const savedLayout = layout ? JSON.parse(layout.value) : [25, 50, 25]
  const userAndWorkspace = await getCurrentUserAndTargetWorkspace(workspaceId)
  if (!userAndWorkspace) {
    return notFound()
  }
  const canViewEmailAndPhone = canViewContactEmailAndPhone(
    userAndWorkspace.targetWorkspaceMember.permissions,
  )

  return (
    <div className="-m-6">
      <ChatStoreProvider>
        <InboxStoreProvider workspaceId={workspaceId}>
          <UserStoreProvider workspaceId={workspaceId}>
            <CustomFieldStoreProvider workspaceId={workspaceId}>
              <SavedReplyStoreProvider
                autoInitialize={false}
                workspaceId={workspaceId}
              >
                <TagStoreProvider workspaceId={workspaceId}>
                  <SequenceStoreProvider workspaceId={workspaceId}>
                    <FlowStoreProvider workspaceId={workspaceId}>
                      <ChatLayout
                        canViewEmailAndPhone={canViewEmailAndPhone}
                        layout={savedLayout}
                        workspaceId={workspaceId}
                      />
                    </FlowStoreProvider>
                  </SequenceStoreProvider>
                </TagStoreProvider>
              </SavedReplyStoreProvider>
            </CustomFieldStoreProvider>
          </UserStoreProvider>
        </InboxStoreProvider>
      </ChatStoreProvider>
    </div>
  )
}
