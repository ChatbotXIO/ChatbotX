"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@chatbotx.io/ui/components/ui/dialog"
import { Form } from "@chatbotx.io/ui/components/ui/form"
import { Label } from "@chatbotx.io/ui/components/ui/label"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@chatbotx.io/ui/components/ui/tooltip"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { CopyIcon, CrownIcon, Loader2Icon, PlusIcon } from "lucide-react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { toast } from "sonner"
import { useCopyToClipboard } from "usehooks-ts"
import { UpgradePlanButton } from "@/enterprise/features/billing/upgrade-plan-dialog"
import { isCloud } from "@/env"
import { useInvalidateUsers } from "@/features/users/provider/user-hook"
import { useWorkspaceId } from "@/hooks/routing"
import { inviteWorkspaceMemberAction } from "../actions/invite-workspace-member.action"
import { getSuperAdminPermissions } from "../helpers"
import { inviteWorkspaceMemberRequest } from "../schema/mutation"
import { WorkspaceMemberPermissionFields } from "./workspace-member-permission-fields"
export function InviteWorkspaceMemberDialog({
  atLimit = false,
}: {
  atLimit?: boolean
}) {
  const t = useTranslations()

  const [open, setOpen] = useState(false)
  const [invitationUrl, setInvitationUrl] = useState<string | null>(null)

  const [_, copy] = useCopyToClipboard()
  const handleCopy = () => {
    copy(invitationUrl ?? "").then(() => {
      toast.success(t("messages.copiedToClipboard"))
    })
  }

  const handleOpenChange = (open1: boolean) => {
    setOpen(open1)
    if (!open1) {
      setInvitationUrl(null)
    }
  }

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      {atLimit ? (
        <div className="flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger
              render={
                <span className="inline-flex">
                  <Button disabled>
                    <PlusIcon className="size-4" />
                    {t("actions.inviteFeature", {
                      feature: t("fields.member.label"),
                    })}
                  </Button>
                </span>
              }
            />
            <TooltipContent>
              {t("billing.limitReached.teamMembers")}
            </TooltipContent>
          </Tooltip>
          {isCloud() && (
            <UpgradePlanButton size="sm" variant="outline">
              <CrownIcon aria-hidden className="size-4" />
              {t("actions.upgradePlan")}
            </UpgradePlanButton>
          )}
        </div>
      ) : (
        <DialogTrigger
          render={
            <Button>
              <PlusIcon className="size-4" />
              {t("actions.inviteFeature", {
                feature: t("fields.member.label"),
              })}
            </Button>
          }
        />
      )}
      <DialogContent className={"max-h-screen max-w-xl overflow-y-scroll"}>
        <DialogHeader>
          <DialogTitle>
            {t("actions.inviteFeature", {
              feature: t("fields.member.label"),
            })}
          </DialogTitle>
          <DialogDescription />
        </DialogHeader>
        {invitationUrl && (
          <div className="break-word flex flex-col gap-2">
            <p>{t("messages.copyInvitationUrlSuccess")}</p>
            <Link
              className="text-blue-500"
              href={invitationUrl}
              target="_blank"
            >
              {invitationUrl}
            </Link>
            <div className="flex items-center gap-2">
              <Button
                onClick={handleCopy}
                size="sm"
                type="button"
                variant="default"
              >
                <CopyIcon className="size-4" />
                {t("actions.copy")}
              </Button>
            </div>
          </div>
        )}
        {!invitationUrl && (
          <AddWorkspaceMemberForm
            cancelHandler={() => setOpen(false)}
            submitHandler={(url: string) => setInvitationUrl(url)}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

type AddWorkspaceMemberFormProps = {
  cancelHandler?: () => void
  submitHandler?: (invitationUrl: string) => void
}

export function AddWorkspaceMemberForm({
  cancelHandler,
  submitHandler,
}: AddWorkspaceMemberFormProps) {
  const workspaceId = useWorkspaceId()
  const invalidateUsers = useInvalidateUsers()

  const t = useTranslations()

  const { form, handleSubmitWithAction, resetFormAndAction } =
    useHookFormAction(
      inviteWorkspaceMemberAction.bind(null, workspaceId),
      zodResolver(inviteWorkspaceMemberRequest),
      {
        actionProps: {
          onSuccess: ({ data }) => {
            resetFormAndAction()
            toast.success(
              t("messages.createdSuccess", {
                feature: t("fields.workspaceMember.label"),
              }),
            )
            invalidateUsers()
            submitHandler?.(
              `${window.location.origin}/invitations/${data.code}`,
            )
          },
          onError: ({ error }) => {
            if (error.serverError) {
              toast.error(error.serverError)
            }
          },
        },
        formProps: {
          mode: "onChange",
          defaultValues: {
            permissions: getSuperAdminPermissions(),
          },
        },
      },
    )

  return (
    <Form {...form}>
      <form className="flex-1 space-y-6" onSubmit={handleSubmitWithAction}>
        <Label>{t("fields.permissions.label")}</Label>
        <div className="flex flex-col gap-4">
          <WorkspaceMemberPermissionFields form={form} />
          <div className="flex items-center justify-end gap-2">
            <Button
              onClick={() => cancelHandler?.()}
              size="sm"
              type="button"
              variant="ghost"
            >
              {t("actions.cancel")}
            </Button>
            <Button
              disabled={!form.formState.isValid || form.formState.isSubmitting}
              size="sm"
              type="submit"
            >
              {form.formState.isSubmitting && (
                <Loader2Icon className="animate-spin" />
              )}
              {t("actions.confirm")}
            </Button>
          </div>
        </div>
      </form>
    </Form>
  )
}
