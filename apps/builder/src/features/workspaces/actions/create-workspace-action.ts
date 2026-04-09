import type { Transaction } from "@chatbotx.io/database/client"
import {
  workspaceMemberModel,
  workspaceModel,
  workspaceUsageModel,
} from "@chatbotx.io/database/schema"
import type {
  OrganizationModel,
  WorkspaceModel,
} from "@chatbotx.io/database/types"
import { createId } from "@chatbotx.io/utils"
import {
  canAccessOrganization,
  organizationPermissions,
} from "@/lib/auth/permissions"
import { ChatbotXException } from "@/lib/errors/exception"

export async function createSimpleWorkspace(
  tx: Transaction,
  userId: string,
  organization: OrganizationModel,
  chatbotData: Pick<WorkspaceModel, "name" | "organizationId" | "timezone">,
): Promise<WorkspaceModel> {
  const organizationMember = await tx.query.organizationMemberModel.findFirst({
    where: {
      organizationId: organization.id,
      userId,
    },
  })
  if (!organizationMember) {
    throw new ChatbotXException(
      "You are not a member of this organization and cannot create a workspace.",
    )
  }

  const canCreateWorkspace = canAccessOrganization(
    organizationMember.role,
    organizationPermissions.createWorkspace,
  )
  if (!canCreateWorkspace) {
    throw new ChatbotXException(
      "You do not have permission to create workspaces in this organization.",
    )
  }

  const newChatbot = await tx
    .insert(workspaceModel)
    .values({
      ...chatbotData,
      id: createId(),
      timezone: "UTC",
      organizationId: organization.id,
    })
    .returning()
    .then((result) => result[0])

  await tx.insert(workspaceUsageModel).values({
    id: createId(),
    workspaceId: newChatbot.id,
    maxContacts: organization.defaultMaxContacts,
  })

  await tx.insert(workspaceMemberModel).values({
    id: createId(),
    userId,
    workspaceId: newChatbot.id,
    role: "owner",
    permissions: {
      superAdmin: true,
      analytics: true,
      flows: true,
      contacts: true,
      onlyAssignedContacts: false,
      emailAndPhone: true,
      broadcast: true,
      ecommerce: false,
    },
    notificationTypes: {
      notifyAdmin: true,
      newMessageToHuman: true,
      newOrder: true,
    },
    notificationChannels: {
      messenger: true,
      email: true,
      telegram: true,
      browser: true,
    },
  })

  return newChatbot
}
