"use client"

import { SwitchField } from "@chatbotx.io/ui/components/form/switch-field"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@chatbotx.io/ui/components/ui/dialog"
import { Form } from "@chatbotx.io/ui/components/ui/form"
import { Label } from "@chatbotx.io/ui/components/ui/label"
import { ScrollArea } from "@chatbotx.io/ui/components/ui/scroll-area"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { Loader2Icon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useEffect } from "react"
import { useWatch } from "react-hook-form"
import { toast } from "sonner"
import { isCommunity } from "@/env"
import { updateWorkspaceMemberAction } from "../actions/update-workspace-member.action"
import { updateWorkspaceMemberRequest } from "../schema/mutation"
import type { WorkspaceMemberResource } from "../schema/resource"

export function UpdateWorkspaceMemberDialog({
  workspaceMember,
  open,
  onOpenChange,
}: {
  workspaceMember: WorkspaceMemberResource | null
  open: boolean
  onOpenChange: (val: boolean) => void
}) {
  const t = useTranslations()
  const router = useRouter()

  const onCancel = () => {
    onOpenChange(false)
  }

  const onSuccess = () => {
    onOpenChange(false)
    router.refresh()
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t("messages.editFeature", {
              feature: t("fields.workspaceMember.label"),
            })}
          </DialogTitle>
          <DialogDescription />
        </DialogHeader>

        <ScrollArea className="h-75">
          <UpdateWorkspaceMemberForm
            cancelHandler={onCancel}
            className="mr-3"
            submitHandler={onSuccess}
            workspaceMember={workspaceMember}
          />
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}

export function UpdateWorkspaceMemberForm({
  workspaceMember,
  cancelHandler,
  submitHandler,
  className,
}: {
  workspaceMember: WorkspaceMemberResource | null
  cancelHandler?: () => void
  submitHandler?: () => void
  className?: string
}) {
  const t = useTranslations()

  const { form, handleSubmitWithAction, resetFormAndAction } =
    useHookFormAction(
      updateWorkspaceMemberAction.bind(
        null,
        workspaceMember?.workspaceId ?? "",
        workspaceMember?.id ?? "",
      ),
      zodResolver(updateWorkspaceMemberRequest),
      {
        actionProps: {
          onSuccess: () => {
            resetFormAndAction()
            toast.success(
              t("messages.updatedSuccess", {
                feature: t("fields.workspaceMember.label"),
              }),
            )
            submitHandler?.()
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
              analytics: true,
              flows: true,
              contacts: true,
              onlyAssignedContacts: true,
              emailAndPhone: true,
              broadcast: true,
              ecommerce: true,
            },
            notificationTypes: {
              notifyAdmin: false,
              newMessageToHuman: false,
              newOrder: false,
            },
            notificationChannels: {
              messenger: false,
              email: false,
              browser: false,
              telegram: false,
            },
          },
        },
      },
    )

  const { setValue, reset } = form
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

  useEffect(() => {
    if (workspaceMember) {
      reset({
        permissions: workspaceMember.permissions,
        // notificationTypes: workspaceMember.notificationTypes,
        // notificationChannels: workspaceMember.notificationChannels,
      })
    }
  }, [workspaceMember, reset])

  return (
    <Form {...form}>
      <form
        className={cn("flex flex-col gap-6", className)}
        onSubmit={handleSubmitWithAction}
      >
        <div className="flex flex-col gap-4">
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
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <Label>{t("fields.notificationType.label")}</Label>
          <div className="flex flex-col gap-4">
            <SwitchField
              formItemClassName="flex flex-row-reverse items-center justify-end gap-2"
              label={t("fields.notificationType.notifyAdmin")}
              name="notificationTypes.notifyAdmin"
              required
            />
            <SwitchField
              formItemClassName="flex flex-row-reverse items-center justify-end gap-2"
              label={t("fields.notificationType.newMessageToHuman")}
              name="notificationTypes.newMessageToHuman"
              required
            />
            <SwitchField
              formItemClassName="flex flex-row-reverse items-center justify-end gap-2"
              label={t("fields.notificationType.newOrder")}
              name="notificationTypes.newOrder"
              required
            />
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <Label>{t("fields.notificationChannel.label")}</Label>
          <div className="flex flex-col gap-4">
            <SwitchField
              formItemClassName="flex flex-row-reverse items-center justify-end gap-2"
              label={t("fields.notificationChannel.messenger")}
              name="notificationChannels.messenger"
              required
            />
            <SwitchField
              formItemClassName="flex flex-row-reverse items-center justify-end gap-2"
              label={t("fields.notificationChannel.email")}
              name="notificationChannels.email"
              required
            />
            <SwitchField
              formItemClassName="flex flex-row-reverse items-center justify-end gap-2"
              label={t("fields.notificationChannel.telegram")}
              name="notificationChannels.telegram"
              required
            />
            <SwitchField
              formItemClassName="flex flex-row-reverse items-center justify-end gap-2"
              label={t("fields.notificationChannel.browser")}
              name="notificationChannels.browser"
              required
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2">
          <Button
            onAbort={() => cancelHandler?.()}
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
      </form>
    </Form>
  )
}
