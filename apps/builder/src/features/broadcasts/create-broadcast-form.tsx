"use client"

import {
  type BroadcastInboxType,
  BroadcastSubaction,
} from "@aha.chat/database/enums"
import {
  type BroadcastSchedulesType,
  type InboxType,
  Omnichannel,
} from "@aha.chat/database/types"
import { ComboboxField } from "@aha.chat/ui/components/form/combobox-field"
import { DateTimePickerField } from "@aha.chat/ui/components/form/date-picker-field"
import { SelectField } from "@aha.chat/ui/components/form/select-field"
import { Button } from "@aha.chat/ui/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@aha.chat/ui/components/ui/card"
import { Form } from "@aha.chat/ui/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { add } from "date-fns"
import { Loader2Icon, XIcon } from "lucide-react"
import { useParams, useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useCallback, useEffect, useMemo, useState } from "react"
import { useFormContext, useWatch } from "react-hook-form"
import { toast } from "sonner"
import { createBroadcastAction } from "@/features/broadcasts/actions/create-broadcast.action"
import { createBroadcastRequest } from "@/features/broadcasts/schemas/action"
import { ContactFilter } from "../contacts/components/contact-filter"
import {
  FlowStoreProvider,
  useFlowStore,
} from "../flows/provider/flow-store-context"
import { InboxIcon } from "../inboxes/components/inbox-icon"

type BroadcastConfig = {
  value: BroadcastInboxType
  description: string
  subactions: {
    value: BroadcastSubaction
    name: string
    description: string
  }[]
}

const getConfigs = (t: ReturnType<typeof useTranslations>) =>
  [
    {
      value: Omnichannel,
      description:
        "Send a flow to all contacts. You can send messages or executes actions.",
      subactions: [
        {
          value: BroadcastSubaction.allContacts,
          name: t("broadcasts.allContacts.title"),
          description: t("broadcasts.allContacts.description"),
        },
      ],
    },
    {
      value: "messenger",
      description: "",
      subactions: [
        {
          value: BroadcastSubaction.messengerList,
          name: t("broadcasts.messengerList.title"),
          description: t("broadcasts.messengerList.description"),
        },
        {
          value: BroadcastSubaction.messengerActiveContacts,
          name: t("broadcasts.messengerActiveContacts.title"),
          description: t("broadcasts.messengerActiveContacts.description"),
        },
        {
          value: BroadcastSubaction.messengerAccountUpdate,
          name: t("broadcasts.messengerAccountUpdate.title"),
          description: t("broadcasts.messengerAccountUpdate.description"),
        },
        {
          value: BroadcastSubaction.messengerConfirmedEventUpdate,
          name: t("broadcasts.messengerConfirmedEventUpdate.title"),
          description: t(
            "broadcasts.messengerConfirmedEventUpdate.description",
          ),
        },
        {
          value: BroadcastSubaction.messengerPostPurchaseUpdate,
          name: t("broadcasts.messengerPostPurchaseUpdate.title"),
          description: t("broadcasts.messengerPostPurchaseUpdate.description"),
        },
      ],
    },
    {
      value: "whatsapp",
      description: "",
      subactions: [
        {
          value: BroadcastSubaction.allContacts,
          name: t("broadcasts.allContacts.title"),
          description: t("broadcasts.allContacts.description"),
        },
      ],
    },
    {
      value: "zalo",
      description: "",
      subactions: [
        {
          value: BroadcastSubaction.allContacts,
          name: t("broadcasts.allContacts.title"),
          description: t("broadcasts.allContacts.description"),
        },
      ],
    },
  ] as BroadcastConfig[]

type CreateBroadcastFormProps = {
  chatbotId: string
}

export function CreateBroadcastForm({ chatbotId }: CreateBroadcastFormProps) {
  const t = useTranslations()
  const router = useRouter()

  const { form, handleSubmitWithAction } = useHookFormAction(
    createBroadcastAction.bind(null, chatbotId),
    zodResolver(createBroadcastRequest),
    {
      actionProps: {
        onSuccess: () => {
          toast.success(
            t("messages.createdSuccess", {
              feature: t("fields.broadcast.label"),
            }),
          )
          router.push(`/chatbots/${chatbotId}/broadcasts`)
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
          inboxType: undefined,
          flowId: undefined,
          subaction: BroadcastSubaction.allContacts,
          schedulesType: "now",
          schedulesAt: null,
          contactFilter: {
            operator: "and",
            conditions: [],
          },
        },
      },
      errorMapProps: {},
    },
  )

  const watchedSubAction = useWatch({
    control: form.control,
    name: "subaction",
  })
  const watchedInboxType = useWatch({
    control: form.control,
    name: "inboxType",
  })

  return (
    <FlowStoreProvider chatbotId={chatbotId}>
      <div className="flex h-svh flex-col items-center justify-center">
        <Form {...form}>
          <form className="flex-1 space-y-4" onSubmit={handleSubmitWithAction}>
            {!watchedInboxType && <CreateBroadcastChooseChannel />}

            {watchedInboxType && !watchedSubAction && (
              <CreateBroadcastChooseSubaction inboxType={watchedInboxType} />
            )}

            {watchedInboxType && watchedSubAction && (
              <CreateBroadcastChooseFlow
                inboxType={watchedInboxType}
                subaction={watchedSubAction}
              />
            )}
          </form>
        </Form>
      </div>
    </FlowStoreProvider>
  )
}

function CreateBroadcastChooseChannel() {
  const t = useTranslations()
  const router = useRouter()

  const { chatbotId } = useParams<{ chatbotId: string }>()
  const { setValue } = useFormContext()

  const configs = useMemo(() => getConfigs(t), [t])

  const handleChooseChannel = useCallback(
    (inboxType: InboxType) => {
      setValue("inboxType", inboxType)
      if (inboxType !== "messenger") {
        setValue("subaction", BroadcastSubaction.allContacts)
      } else {
        setValue("subaction", null)
      }
    },
    [setValue],
  )

  const handleBack = useCallback(() => {
    router.push(`/chatbots/${chatbotId}/broadcasts`)
  }, [router, chatbotId])

  return (
    <Card className="mt-10 w-lg">
      <CardHeader>
        <CardTitle className="text-xl">{t("actions.chooseChannel")}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {configs.map((config) => (
          <div className="flex w-full items-center gap-2" key={config.value}>
            <InboxIcon
              iconClassName="size-5"
              inboxType={config.value as InboxType}
              wrapperClassName="flex-1 gap-2"
            />
            <Button
              onClick={() => handleChooseChannel(config.value as InboxType)}
              type="button"
              variant="secondary"
            >
              {t("actions.continue")}
            </Button>
          </div>
        ))}

        <div className="mt-4 flex">
          <Button onClick={handleBack} type="button" variant="outline">
            {t("actions.back")}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function CreateBroadcastChooseSubaction({
  inboxType,
}: {
  inboxType: BroadcastInboxType
}) {
  const t = useTranslations()
  const { setValue } = useFormContext()

  const configs = useMemo(
    () =>
      getConfigs(t).find((config) => config.value === inboxType)?.subactions ??
      [],
    [t, inboxType],
  )

  const handleChooseSubaction = useCallback(
    (val: BroadcastSubaction) => {
      setValue("subaction", val)
    },
    [setValue],
  )

  const handleBack = useCallback(() => {
    setValue("subaction", null)
    setValue("inboxType", null)
  }, [setValue])

  return (
    <Card className="mt-10 w-xl">
      <CardHeader>
        <CardTitle className="text-xl">
          {t("actions.chooseSubaction")}
        </CardTitle>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {configs.map((subaction) => (
          <div className="flex w-full items-center gap-2" key={subaction.value}>
            <div className="flex flex-col gap-1">
              <span className="flex flex-1 gap-2 font-semibold">
                {subaction.name}
              </span>
              {subaction.description && (
                <span className="text-gray-500 text-sm">
                  {subaction.description}
                </span>
              )}
            </div>
            <Button
              onClick={() => handleChooseSubaction(subaction.value)}
              type="button"
              variant="secondary"
            >
              {t("actions.continue")}
            </Button>
          </div>
        ))}

        <div className="mt-4 flex">
          <Button onClick={handleBack} type="button" variant="outline">
            {t("actions.back")}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

type CreateBroadcastChooseFlowProps = {
  inboxType: BroadcastInboxType
  subaction: BroadcastSubaction
}

function CreateBroadcastChooseFlow(props: CreateBroadcastChooseFlowProps) {
  const t = useTranslations()
  const router = useRouter()
  const { chatbotId } = useParams<{ chatbotId: string }>()

  const schedulesOptions = useMemo(
    () => [
      {
        value: "now",
        label: t("fields.schedule.now"),
      },
      {
        value: "future",
        label: t("fields.schedule.scheduled"),
      },
    ],
    [t],
  )

  const { flows } = useFlowStore((state) => state)
  const [subactionInfo, setSubactionInfo] = useState<{
    value: BroadcastSubaction
    name: string
    description: string
  }>({
    value: BroadcastSubaction.allContacts,
    name: "Omnichannel",
    description:
      "Send a flow to all contacts. You can send messages or executes actions.",
  })

  const { control, setValue, formState } = useFormContext()
  const watchedSchedulesType = useWatch({ control, name: "schedulesType" })

  const handleCancel = useCallback(() => {
    router.push(`/chatbots/${chatbotId}/broadcasts`)
  }, [router, chatbotId])

  const handleScheduleTypeChange = useCallback(
    (value: BroadcastSchedulesType) => {
      if (value === "now") {
        setValue("schedulesAt", null)
      }
    },
    [setValue],
  )

  const defaultDateTime = useMemo(() => add(new Date(), { minutes: 15 }), [])

  // biome-ignore lint/correctness/useExhaustiveDependencies: ignore
  const handleRemoveInbox = useCallback(() => {
    setValue("inboxType", null)
    setValue("subaction", null)
  }, [])

  useEffect(() => {
    if (props.inboxType) {
      const subactions: {
        value: BroadcastSubaction
        name: string
        description: string
      }[] = getConfigs(t).flatMap((c) => (c as BroadcastConfig).subactions)

      const selectedSubaction = subactions.find(
        (s) => s.value === props.subaction,
      )
      if (selectedSubaction) {
        setSubactionInfo(selectedSubaction)
      }
    }
  }, [props.inboxType, props.subaction, t])

  return (
    <Card className="mt-10 max-w-3xl">
      <CardHeader>
        <CardTitle className="text-xl">{t("broadcasts.details")}</CardTitle>
      </CardHeader>

      <CardContent className="flex flex-col gap-6">
        <Card className="flex gap-2 py-3">
          <CardContent className="flex px-3">
            <div className="flex flex-1 flex-col gap-2">
              <InboxIcon
                iconClassName="size-5"
                inboxType={props.inboxType}
                label={subactionInfo.name}
                wrapperClassName="gap-2"
              />
              {subactionInfo.description && (
                <span className="text-gray-500 text-sm">
                  {subactionInfo.description}
                </span>
              )}
            </div>

            <Button
              className="rounded-full"
              onClick={handleRemoveInbox}
              size="icon"
              type="button"
              variant="ghost"
            >
              <XIcon />
            </Button>
          </CardContent>
        </Card>

        <ComboboxField
          label={t("fields.flowId.label")}
          name="flowId"
          options={flows.map((flow) => ({
            label: flow.name,
            value: flow.id,
          }))}
          required={true}
        />

        <SelectField
          defaultValue="now"
          label={t("fields.schedule.label")}
          name="schedulesType"
          options={schedulesOptions}
          required
          triggerValueChange={(value) =>
            handleScheduleTypeChange(value as BroadcastSchedulesType)
          }
        />

        {watchedSchedulesType === "future" && (
          <DateTimePickerField
            disabled={{
              before: new Date(),
            }}
            displayFormat={{ hour24: "yyyy-MM-dd HH:mm" }}
            granularity="minute"
            label={t("fields.chooseTime.label")}
            name="schedulesAt"
            required
            value={defaultDateTime}
          />
        )}

        <ContactFilter parentName="contactFilter" />

        <div className="flex justify-end gap-2">
          <Button onClick={handleCancel} type="button" variant="outline">
            {t("actions.cancel")}
          </Button>

          <Button
            disabled={!formState.isValid || formState.isSubmitting}
            type="submit"
          >
            {formState.isSubmitting && <Loader2Icon className="animate-spin" />}
            {t("actions.confirm")}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
