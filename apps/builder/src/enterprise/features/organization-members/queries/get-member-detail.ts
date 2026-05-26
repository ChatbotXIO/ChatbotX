"use server"

import { ChatbotXException, organizationService } from "@chatbotx.io/business"
import { db } from "@chatbotx.io/database/client"
import { organizationMemberRoles } from "@chatbotx.io/database/partials"
import { organizationMemberService } from "@/features/organization-members/services"
import { getCurrentUser } from "@/lib/auth/utils"
import { getDomainFromHeader } from "@/lib/domain"

export type OrganizationMemberDetail = {
  userId: string
  name: string
  email: string
  image: string | null
  organizationRole: string
  workspaceAssignments: Array<{ workspaceId: string; role: string }>
}

export async function getOrganizationMemberDetail(props: {
  userId: string
}): Promise<OrganizationMemberDetail | null> {
  const caller = await getCurrentUser()
  if (!caller) {
    throw new ChatbotXException("Não autenticado.")
  }

  const domain = await getDomainFromHeader()
  const organization = await organizationService.findByDomain(domain)

  const callerMembership = await organizationMemberService.findBy({
    where: { organizationId: organization.id, userId: caller.id },
  })
  if (
    !callerMembership ||
    (callerMembership.role !== organizationMemberRoles.enum.owner &&
      callerMembership.role !== organizationMemberRoles.enum.manager)
  ) {
    throw new ChatbotXException("Você não tem permissão para ver este usuário.")
  }

  const member = await db.query.organizationMemberModel.findFirst({
    where: {
      organizationId: organization.id,
      userId: props.userId,
    },
    with: { user: true },
  })
  if (!member?.user) {
    return null
  }

  const wsMembers = await db.query.workspaceMemberModel.findMany({
    where: { userId: props.userId },
    with: { workspace: { columns: { id: true, organizationId: true } } },
  })
  const workspaceAssignments = wsMembers
    .filter((m) => m.workspace?.organizationId === organization.id)
    .map((m) => ({ workspaceId: m.workspaceId, role: m.role }))

  return {
    userId: member.userId,
    name: member.user.name ?? member.user.email,
    email: member.user.email,
    image: member.user.image ?? null,
    organizationRole: member.role,
    workspaceAssignments,
  }
}
