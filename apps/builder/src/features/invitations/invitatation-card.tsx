"use client"

import type {
  InvitationModel,
  OrganizationModel,
  UserModel,
  WorkspaceModel,
} from "@chatbotx.io/database/types"
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@chatbotx.io/ui/components/ui/avatar"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Card, CardContent } from "@chatbotx.io/ui/components/ui/card"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { toast } from "sonner"
import { getOrganizationLogoUrl } from "../organization/utils"
import { getChatbotLogoUrl } from "../workspaces/helpers"
import { acceptInvitationAction } from "./actions/accept-invitation"

export function InvitationCard({
  invitation,
  workspace,
  organization,
  user,
}: {
  invitation: InvitationModel
  workspace: WorkspaceModel | null
  organization: OrganizationModel
  user: UserModel
}) {
  const router = useRouter()
  const t = useTranslations()

  const { execute, isPending } = useAction(acceptInvitationAction, {
    onSuccess: () => {
      router.push("/")
    },
    onError: ({ error }) => {
      if (error.serverError) {
        toast.error(error.serverError)
      }
    },
  })

  return (
    <Card className="max-w-lg">
      <CardContent className="flex flex-col gap-4">
        {workspace ? (
          <ChatbotInvitationCard
            organization={organization}
            user={user}
            workspace={workspace}
          />
        ) : (
          <OrganizationInvitationCard organization={organization} user={user} />
        )}
        <div className="mt-4 flex justify-center gap-2">
          <Button
            disabled={isPending}
            onClick={() => router.push("/")}
            type="button"
            variant="secondary"
          >
            {t("actions.cancel")}
          </Button>
          <Button
            disabled={isPending}
            onClick={() => execute({ code: invitation.code })}
            type="button"
            variant="default"
          >
            {t("actions.joinTheTeam")}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

export function ChatbotInvitationCard({
  workspace,
  organization,
  user,
}: {
  workspace: WorkspaceModel
  organization: OrganizationModel
  user: UserModel
}) {
  const t = useTranslations()

  return (
    <>
      <div className="flex flex-col items-center justify-center gap-2">
        <Avatar className="size-16">
          <AvatarImage src={getChatbotLogoUrl(workspace)} />
          <AvatarFallback className="rounded font-bold text-2xl">
            {workspace.name.charAt(0)}
          </AvatarFallback>
        </Avatar>
        <h3 className="font-medium text-3xl">{workspace.name}</h3>
      </div>

      <h3 className="font-bold text-lg">
        {t("invitation.chatbotInvitationDescription1", {
          chatbotName: workspace.name,
          organizationName: organization.name,
        })}
      </h3>

      <p>Hello,</p>

      <p>
        {t("invitation.chatbotInvitationDescription2", {
          userName: user.name ?? "",
          chatbotName: workspace.name,
          organizationName: organization.name,
        })}
      </p>
    </>
  )
}

export function OrganizationInvitationCard({
  organization,
  user,
}: {
  organization: OrganizationModel
  user: UserModel
}) {
  const t = useTranslations()

  return (
    <>
      <Avatar>
        <AvatarImage src={getOrganizationLogoUrl(organization)} />
        <AvatarFallback>{organization.name.charAt(0)}</AvatarFallback>
      </Avatar>

      <h3 className="font-bold text-lg">
        {t("invitation.organizationInvitationDescription1", {
          organizationName: organization.name,
        })}
      </h3>

      <p>Hello,</p>

      <p>
        {t("invitation.organizationInvitationDescription2", {
          userName: user.name ?? "",
          organizationName: organization.name,
        })}
      </p>
    </>
  )
}
