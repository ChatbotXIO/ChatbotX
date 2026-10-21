"use client"

import type { InvitationSummary } from "@chatbotx.io/business"
import { isWorkspaceScheduledForDeletion } from "@chatbotx.io/business/workspace-lifecycle/predicates"
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@chatbotx.io/ui/components/ui/avatar"
import { Button, buttonVariants } from "@chatbotx.io/ui/components/ui/button"
import { Card, CardContent } from "@chatbotx.io/ui/components/ui/card"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { toast } from "sonner"
import { useInvalidateUsers } from "@/features/users/provider/user-hook"
import { useWorkspaceLogoUrl } from "../workspaces/helpers"
import { acceptInvitationAction } from "./actions/accept-invitation"

export function InvitationCard({
  invitation,
  isAuthenticated,
}: {
  invitation: InvitationSummary | null
  isAuthenticated: boolean
}) {
  const router = useRouter()
  const t = useTranslations()
  const invalidateUsers = useInvalidateUsers()
  const canJoin = invitation?.workspace
    ? !isWorkspaceScheduledForDeletion(invitation.workspace)
    : false

  const { execute, isPending } = useAction(acceptInvitationAction, {
    onSuccess: () => {
      invalidateUsers()
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
        {canJoin && invitation?.workspace ? (
          <WorkspaceInvitationCard
            inviter={invitation.inviter}
            workspace={invitation.workspace}
          />
        ) : (
          <p className="text-muted-foreground">
            {invitation?.workspace &&
            isWorkspaceScheduledForDeletion(invitation.workspace)
              ? t("invitation.workspaceUnavailable")
              : t("invitation.invalidInvitation")}
          </p>
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
          {invitation && isAuthenticated ? (
            <Button
              disabled={isPending || !canJoin}
              onClick={() => execute({ code: invitation.code })}
              type="button"
              variant="default"
            >
              {t("actions.joinTheTeam")}
            </Button>
          ) : null}
          {invitation && !isAuthenticated ? (
            <Link
              className={buttonVariants()}
              href={`/api/invitations/${invitation.code}/start`}
            >
              {t("invitation.signUpToJoin")}
            </Link>
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}

export function WorkspaceInvitationCard({
  workspace,
  inviter,
}: {
  workspace: { name: string; logo: string | null }
  inviter: { name: string | null }
}) {
  const t = useTranslations()
  const logoUrl = useWorkspaceLogoUrl(workspace)

  return (
    <>
      <div className="flex flex-col items-center justify-center gap-2">
        <Avatar className="size-16">
          <AvatarImage src={logoUrl} />
          <AvatarFallback className="rounded font-bold text-2xl">
            {workspace.name.charAt(0)}
          </AvatarFallback>
        </Avatar>
        <h3 className="font-medium text-3xl">{workspace.name}</h3>
      </div>

      <h3 className="font-bold text-lg">
        {t("invitation.chatbotInvitationDescription1", {
          chatbotName: workspace.name,
        })}
      </h3>

      <p>Hello,</p>

      <p>
        {t("invitation.chatbotInvitationDescription2", {
          userName: inviter.name ?? "",
          chatbotName: workspace.name,
        })}
      </p>
    </>
  )
}
