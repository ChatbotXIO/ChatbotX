import { organizationService } from "@chatbotx.io/business"
import { organizationMemberRoles } from "@chatbotx.io/database/partials"
import { notFound } from "next/navigation"
import { ManageLayout } from "@/features/manage/manage-layout"
import { organizationMemberService } from "@/features/organization-members/services"
import { getCurrentUser } from "@/lib/auth/utils"
import { getDomainFromHeader } from "@/lib/domain"

export default async function ManageLayoutPage({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await getCurrentUser()
  if (!user) {
    return notFound()
  }

  // Find organization by domain
  const currentDomain = await getDomainFromHeader()
  try {
    const organization = await organizationService.findByDomain(currentDomain)

    // Check if user is a member of the organization
    const organizationMember = await organizationMemberService.findBy({
      where: {
        organizationId: organization.id,
        userId: user.id,
      },
    })

    if (
      !organizationMember ||
      organizationMember.role !== organizationMemberRoles.enum.admin
    ) {
      return notFound()
    }

    return <ManageLayout>{children}</ManageLayout>
  } catch {
    return notFound()
  }
}
