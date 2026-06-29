"use client"

import { type ChannelType, channelTypes } from "@chatbotx.io/database/partials"
import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import { SelectField } from "@chatbotx.io/ui/components/form/select-field"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Form } from "@chatbotx.io/ui/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { Loader2Icon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useMemo, useState } from "react"
import { toast } from "sonner"
import {
  allInboxConfigs,
  useInboxOptionsByChannel,
} from "@/features/inboxes/provider/inbox-hook"
import { useInboxStore } from "@/features/inboxes/provider/inbox-store-context"
import { createContactAction } from "./actions/create-contact.action"
import { createContactRequest } from "./schemas/action"

const isChannelType = (channelValue: string): channelValue is ChannelType =>
  channelTypes.options.includes(channelValue as ChannelType)

const channelLabel = (channelValue: ChannelType) =>
  channelValue === channelTypes.enum.smtp
    ? "Email"
    : (allInboxConfigs[channelValue as keyof typeof allInboxConfigs]?.label ??
      channelValue)

const userIdPlaceholderKey = (channel: ChannelType) => {
  switch (channel) {
    case channelTypes.enum.instagram:
      return "fields.userId.placeholders.instagram"
    case channelTypes.enum.messenger:
      return "fields.userId.placeholders.messenger"
    case channelTypes.enum.telegram:
      return "fields.userId.placeholders.telegram"
    case channelTypes.enum.tiktok:
      return "fields.userId.placeholders.tiktok"
    case channelTypes.enum.zalo:
      return "fields.userId.placeholders.zalo"
    default:
      return
  }
}

export function CreateContactForm({
  workspaceId,
  onSubmmited,
  onCancelled,
}: {
  workspaceId: string
  onSubmmited?: () => void
  onCancelled?: () => void
}) {
  const t = useTranslations()
  const [channel, setChannel] = useState<ChannelType | undefined>(undefined)
  const inboxes = useInboxStore((state) => state.inboxes)
  const channelOptions = useMemo(
    () =>
      [...new Set(inboxes.map((inbox) => inbox.channel))]
        .filter(isChannelType)
        .filter(
          (channelValue) => channelValue !== channelTypes.enum.omnichannel,
        )
        .map((channelValue) => ({
          value: channelValue,
          label: channelLabel(channelValue),
        })),
    [inboxes],
  )
  const inboxOptions = useInboxOptionsByChannel(channel)
  const isWhatsapp = channel === channelTypes.enum.whatsapp
  const isEmail = channel === channelTypes.enum.smtp
  const isSocial =
    !!channel &&
    !isWhatsapp &&
    !isEmail &&
    channel !== channelTypes.enum.webchat &&
    channel !== channelTypes.enum.omnichannel
  const placeholderKey = channel ? userIdPlaceholderKey(channel) : undefined
  const userIdPlaceholder =
    placeholderKey === undefined ? undefined : t(placeholderKey)

  const { form, handleSubmitWithAction, resetFormAndAction } =
    useHookFormAction(
      createContactAction.bind(null, workspaceId),
      zodResolver(createContactRequest),
      {
        actionProps: {
          onSuccess: () => {
            resetFormAndAction()
            toast.success(
              t("messages.createdSuccess", {
                feature: t("fields.contact.label"),
              }),
            )
            onSubmmited?.()
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
            phoneNumber: "",
            email: "",
            firstName: "",
            lastName: "",
            gender: "unknown",
            inboxId: "",
            contactId: "",
          },
        },
        errorMapProps: {},
      },
    )

  const genderLabels = [
    {
      value: "male",
      label: t("fields.gender.male"),
    },
    {
      value: "female",
      label: t("fields.gender.female"),
    },
    {
      value: "unknown",
      label: t("fields.gender.unknown"),
    },
  ]

  return (
    <Form {...form}>
      <form className="flex-1 space-y-4" onSubmit={handleSubmitWithAction}>
        <SelectField
          label={t("fields.source.label")}
          name="channel"
          options={channelOptions}
          placeholder={t("fields.source.placeholder")}
          required
          triggerValueChange={(value) => {
            setChannel(value && isChannelType(value) ? value : undefined)
            form.setValue("inboxId", "")
          }}
        />

        <SelectField
          label={t("fields.inbox.label")}
          name="inboxId"
          options={inboxOptions}
          placeholder={t("fields.inbox.placeholder")}
          required
        />

        {isSocial && (
          <InputField
            label={`${channelLabel(channel)} ${t("fields.userId.label")}`}
            name="contactId"
            placeholder={userIdPlaceholder}
            required
          />
        )}

        <InputField
          label={t("fields.phoneNumber.label")}
          name="phoneNumber"
          placeholder="090xxxxxxx"
          required={isWhatsapp}
        />

        <InputField
          label={t("fields.email.label")}
          name="email"
          placeholder="email@chatbotx.io"
          required={isEmail}
        />

        <InputField
          label={t("fields.firstName.label")}
          name="firstName"
          placeholder={t("fields.firstName.placeholder")}
        />

        <InputField
          label={t("fields.lastName.label")}
          name="lastName"
          placeholder={t("fields.lastName.placeholder")}
        />

        <SelectField
          defaultValue="unknown"
          label={t("fields.gender.label")}
          name="gender"
          options={genderLabels}
        />

        <div className="flex justify-end gap-4">
          <Button onClick={onCancelled} type="button" variant="ghost">
            {t("actions.cancel")}
          </Button>
          <Button
            disabled={!form.formState.isValid || form.formState.isSubmitting}
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
