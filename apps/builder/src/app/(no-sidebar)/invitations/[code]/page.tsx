import { resolvePlatformUrls } from "@chatbotx.io/business"
import { InvitationCard } from "@/features/invitations/invitatation-card"
import { findInvitation } from "@/features/invitations/queries"
import { PlatformUrlsProvider } from "@/features/platform"

type InvitationsPageProps = {
  params: Promise<{ code: string }>
}

export default async function InvitationsPage(props: InvitationsPageProps) {
  const params = await props.params
  const { invitation, user, workspace, organization } = await findInvitation({
    code: params.code,
  })

  const platformUrls = await resolvePlatformUrls({
    organizationId: organization.id,
  })

  return (
    <div className="flex h-screen w-screen items-center justify-center">
      <PlatformUrlsProvider urls={platformUrls}>
        <InvitationCard
          invitation={invitation}
          organization={organization}
          user={user}
          workspace={workspace}
        />
      </PlatformUrlsProvider>
    </div>
  )
}
