import { InvitationCard } from "@/features/invitations/invitatation-card"
import { findInvitation } from "@/features/invitations/queries"
import { getCurrentUser } from "@/lib/auth/utils"

type InvitationsPageProps = {
  params: Promise<{ code: string }>
}

export default async function InvitationsPage(props: InvitationsPageProps) {
  const params = await props.params
  const [{ invitation, user, workspace }, currentUser] = await Promise.all([
    findInvitation({ code: params.code }),
    getCurrentUser(),
  ])

  return (
    <div className="flex h-screen w-screen items-center justify-center">
      <InvitationCard
        invitation={invitation}
        isAuthenticated={Boolean(currentUser)}
        user={user}
        workspace={workspace}
      />
    </div>
  )
}
