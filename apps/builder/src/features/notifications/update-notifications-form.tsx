"use client"

import { SwitchField } from "@chatbotx.io/ui/components/form/switch-field"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Card, CardContent } from "@chatbotx.io/ui/components/ui/card"
import { Form } from "@chatbotx.io/ui/components/ui/form"
import { Label } from "@chatbotx.io/ui/components/ui/label"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { Loader2Icon } from "lucide-react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { updateMyNotificationsAction } from "./actions/update-notifications-action"
import { updateNotificationsSchema } from "./schema/update-notifications-schema"

type NotificationTypes = {
  notifyAdmin?: boolean
  newMessageToHuman?: boolean
  newOrder?: boolean
}

type NotificationChannels = {
  messenger?: boolean
  email?: boolean
  telegram?: boolean
  browser?: boolean
}

export function UpdateNotificationsForm({
  workspaceId,
  notificationTypes,
  notificationChannels,
}: {
  workspaceId: string
  notificationTypes: NotificationTypes
  notificationChannels: NotificationChannels
}) {
  const t = useTranslations()

  const { form, handleSubmitWithAction } = useHookFormAction(
    updateMyNotificationsAction.bind(null, workspaceId),
    zodResolver(updateNotificationsSchema),
    {
      actionProps: {
        onSuccess: () => {
          toast.success(
            t("messages.updatedSuccess", {
              feature: t("fields.notificationType.label"),
            }),
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
          notificationTypes: {
            notifyAdmin: notificationTypes?.notifyAdmin ?? false,
            newMessageToHuman: notificationTypes?.newMessageToHuman ?? false,
            newOrder: notificationTypes?.newOrder ?? false,
          },
          notificationChannels: {
            messenger: notificationChannels?.messenger ?? false,
            email: notificationChannels?.email ?? false,
            telegram: notificationChannels?.telegram ?? false,
            browser: notificationChannels?.browser ?? false,
          },
        },
      },
      errorMapProps: {},
    },
  )

  return (
    <Card>
      <CardContent>
        <Form {...form}>
          <form
            className="flex flex-col gap-6"
            onSubmit={handleSubmitWithAction}
          >
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

            <div className="flex justify-start">
              <Button
                disabled={form.formState.isSubmitting}
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
      </CardContent>
    </Card>
  )
}
