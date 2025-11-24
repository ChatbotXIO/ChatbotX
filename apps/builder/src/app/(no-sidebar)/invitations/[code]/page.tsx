import { InvitationCard } from "@/features/invitations/invitatation-card"
import { findInvitation } from "@/features/invitations/queries"

type InvitationsPageProps = {
  params: Promise<{ code: string }>
}

export default async function InvitationsPage(props: InvitationsPageProps) {
  const params = await props.params
  const { invitation, user, chatbot, organization } = await findInvitation({
    code: params.code,
  })

  return (
    <div className="flex h-screen w-screen items-center justify-center">
      <InvitationCard
        chatbot={chatbot}
        invitation={invitation}
        organization={organization}
        user={user}
      />
    </div>
  )
}
