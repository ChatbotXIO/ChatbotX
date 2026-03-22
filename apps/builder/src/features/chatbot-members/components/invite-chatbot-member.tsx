"use client"

import { SwitchField } from "@aha.chat/ui/components/form/switch-field"
import { Button } from "@aha.chat/ui/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@aha.chat/ui/components/ui/dialog"
import { Form } from "@aha.chat/ui/components/ui/form"
import { Label } from "@aha.chat/ui/components/ui/label"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { CopyIcon, Loader2Icon, PlusIcon } from "lucide-react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { useEffect, useState } from "react"
import { useWatch } from "react-hook-form"
import { toast } from "sonner"
import { useCopyToClipboard } from "usehooks-ts"
import { isCommunity } from "@/env"
import { inviteChatbotMemberAction } from "../actions/invite-chatbot-member.action"
import { inviteChatbotMemberRequest } from "../schemas/chatbot-member.request"
export function InviteChatbotMemberDialog() {
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
      <DialogTrigger asChild>
        <Button>
          <PlusIcon className="size-4" />
          {t("actions.inviteFeature", {
            feature: t("fields.member.label"),
          })}
        </Button>
      </DialogTrigger>
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
          <AddChatbotMemberForm
            cancelHandler={() => setOpen(false)}
            submitHandler={(url: string) => setInvitationUrl(url)}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

type AddChatbotMemberFormProps = {
  cancelHandler?: () => void
  submitHandler?: (invitationUrl: string) => void
}

export function AddChatbotMemberForm({
  cancelHandler,
  submitHandler,
}: AddChatbotMemberFormProps) {
  const { chatbotId } = useParams<{ chatbotId: string }>()
  const t = useTranslations()

  const { form, handleSubmitWithAction, resetFormAndAction } =
    useHookFormAction(
      inviteChatbotMemberAction.bind(null, chatbotId),
      zodResolver(inviteChatbotMemberRequest),
      {
        actionProps: {
          onSuccess: ({ data }) => {
            resetFormAndAction()
            toast.success(
              t("messages.createdSuccess", {
                feature: t("fields.chatbotMember.label"),
              }),
            )
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
            permissions: {
              superAdmin: true,
              analytics: false,
              flows: false,
              contacts: false,
              onlyAssignedContacts: false,
              emailAndPhone: false,
              broadcast: false,
              ecommerce: false,
            },
          },
        },
      },
    )

  const { setValue } = form
  const isSuperAdmin = useWatch({
    control: form.control,
    name: "permissions.superAdmin",
  })
  useEffect(() => {
    if (isSuperAdmin) {
      setValue("permissions.analytics", true)
      setValue("permissions.flows", true)
      setValue("permissions.contacts", true)
      setValue("permissions.onlyAssignedContacts", true)
      setValue("permissions.emailAndPhone", true)
      setValue("permissions.broadcast", true)
      setValue("permissions.ecommerce", true)
    }
  }, [isSuperAdmin, setValue])

  return (
    <Form {...form}>
      <form className="flex-1 space-y-6" onSubmit={handleSubmitWithAction}>
        <Label>{t("fields.permissions.label")}</Label>
        <div className="flex flex-col gap-4">
          <SwitchField
            disabled={isCommunity}
            formItemClassName="flex flex-row-reverse items-center justify-end gap-2"
            label={t("fields.permissions.superAdmin")}
            name="permissions.superAdmin"
            required
          />
          {!isSuperAdmin && (
            <>
              <SwitchField
                formItemClassName="flex flex-row-reverse items-center justify-end gap-2"
                label={t("fields.permissions.analytics")}
                name="permissions.analytics"
                required
              />
              <SwitchField
                formItemClassName="flex flex-row-reverse items-center justify-end gap-2"
                label={t("fields.permissions.flows")}
                name="permissions.flows"
                required
              />
              <SwitchField
                formItemClassName="flex flex-row-reverse items-center justify-end gap-2"
                label={t("fields.permissions.contacts")}
                name="permissions.contacts"
                required
              />
              <SwitchField
                formItemClassName="flex flex-row-reverse items-center justify-end gap-2"
                label={t("fields.permissions.onlyAssignedContacts")}
                name="permissions.onlyAssignedContacts"
                required
              />
              <SwitchField
                formItemClassName="flex flex-row-reverse items-center justify-end gap-2"
                label={t("fields.permissions.emailAndPhone")}
                name="permissions.emailAndPhone"
                required
              />
              <SwitchField
                formItemClassName="flex flex-row-reverse items-center justify-end gap-2"
                label={t("fields.permissions.broadcast")}
                name="permissions.broadcast"
                required
              />
              <SwitchField
                formItemClassName="flex flex-row-reverse items-center justify-end gap-2"
                label={t("fields.permissions.ecommerce")}
                name="permissions.ecommerce"
                required
              />
            </>
          )}
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
