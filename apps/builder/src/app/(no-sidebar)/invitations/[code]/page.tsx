import { resolveTenantByDomain } from "@chatbotx.io/auth/tenant"
import { InvitationCard } from "@/features/invitations/invitatation-card"
import { findInvitation } from "@/features/invitations/queries"
import { getCurrentUser } from "@/lib/auth/utils"
import { getDomainFromHeader } from "@/lib/domain"

type InvitationsPageProps = {
  params: Promise<{ code: string }>
}

export default async function InvitationsPage(props: InvitationsPageProps) {
  const params = await props.params
  const tenantId = await resolveTenantByDomain(await getDomainFromHeader())
  const [invitation, currentUser] = await Promise.all([
    findInvitation({ code: params.code, tenantId }),
    getCurrentUser(),
  ])

  return (
    <div className="flex h-screen w-screen items-center justify-center">
      <InvitationCard
        invitation={invitation}
        isAuthenticated={Boolean(currentUser)}
      />
    </div>
  )
}
