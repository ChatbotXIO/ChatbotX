"use client"

import { BroadcastFlowType, BroadcastSubaction } from "@aha.chat/database/enums"
import {
  type BroadcastSchedulesType,
  type ChannelType,
  channelType,
} from "@aha.chat/database/types"
import {
  extractTemplateParams,
  StepType,
  type TemplateComponent,
  type WaTemplateParams,
} from "@aha.chat/flow-config"
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
import { useFlowStore } from "../flows/provider/flow-store-context"
import { InboxIcon } from "../inboxes/components/inbox-icon"
import { TemplateParamsForm } from "../integration-whatsapp/message-templates/components/template-params-form"
import { TemplatePreview } from "../integration-whatsapp/message-templates/components/template-preview"
import { useTemplateStore } from "../integration-whatsapp/message-templates/provider/template-store-context"
import type { MessageTemplateWithComponents } from "../integration-whatsapp/message-templates/type"
import { useIntegrationStore } from "../integration-whatsapp/provider/integration-store-context"

type BroadcastConfig = {
  value: ChannelType
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
      value: channelType.omnichannel,
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
          value: BroadcastSubaction.whatsappTemplateMessage,
          name: t("broadcasts.whatsappTemplateMessage.title"),
          description: t("broadcasts.whatsappTemplateMessage.description"),
        },
        {
          value: BroadcastSubaction.whatsappWithin24Hours,
          name: t("broadcasts.whatsappWithin24Hours.title"),
          description: t("broadcasts.whatsappWithin24Hours.description"),
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

  const { appendFilter, resetFilter, getAllActiveFlows } = useFlowStore(
    (state) => state,
  )

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
          channel: undefined,
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
  const watchedChannel = useWatch({
    control: form.control,
    name: "channel",
  })
  const watchedIntegrationWhatsappId = useWatch({
    control: form.control,
    name: "integrationWhatsappId",
  })

  useEffect(() => {
    if (watchedSubAction === BroadcastSubaction.whatsappTemplateMessage) {
      appendFilter({
        startType: StepType.sendWaTemplateMessage,
        integrationWhatsappId: watchedIntegrationWhatsappId,
      })
      getAllActiveFlows()
    } else {
      resetFilter()
      getAllActiveFlows()
    }
    return undefined
  }, [
    watchedSubAction,
    watchedIntegrationWhatsappId,
    appendFilter,
    resetFilter,
    getAllActiveFlows,
  ])

  return (
    <div className="flex h-svh flex-col items-center justify-center">
      <Form {...form}>
        <form className="flex-1 space-y-4" onSubmit={handleSubmitWithAction}>
          {!watchedChannel && <CreateBroadcastChooseChannel />}

          {watchedChannel && !watchedSubAction && (
            <CreateBroadcastChooseSubaction channel={watchedChannel} />
          )}

          {watchedChannel && watchedSubAction && (
            <CreateBroadcastChooseFlow
              channel={watchedChannel}
              subaction={watchedSubAction}
            />
          )}
        </form>
      </Form>
    </div>
  )
}

function CreateBroadcastChooseChannel() {
  const t = useTranslations()
  const router = useRouter()

  const { chatbotId } = useParams<{ chatbotId: string }>()
  const { setValue } = useFormContext()

  const configs = useMemo(() => getConfigs(t), [t])

  const handleChooseChannel = useCallback(
    (channel: ChannelType) => {
      setValue("channel", channel)
      if (channel === "messenger" || channel === "whatsapp") {
        setValue("subaction", null)
      } else {
        setValue("subaction", BroadcastSubaction.allContacts)
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
            <div className="flex-1">
              <InboxIcon channel={config.value} />
            </div>
            <Button
              onClick={() => handleChooseChannel(config.value)}
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

function CreateBroadcastChooseSubaction({ channel }: { channel: ChannelType }) {
  const t = useTranslations()
  const { setValue } = useFormContext()

  const configs = useMemo(
    () =>
      getConfigs(t).find((config) => config.value === channel)?.subactions ??
      [],
    [t, channel],
  )

  const handleChooseSubaction = useCallback(
    (val: BroadcastSubaction) => {
      setValue("subaction", val)
    },
    [setValue],
  )

  const handleBack = useCallback(() => {
    setValue("subaction", null)
    setValue("channel", null)
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
              className="ml-auto"
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

function BroadcastFlowTypeSelector({
  subaction,
}: {
  subaction: BroadcastSubaction | null
}) {
  const t = useTranslations()
  const { setValue } = useFormContext()
  const flowTypes: Array<{
    value: BroadcastFlowType
    label: string
    description: string
  }> = [
    {
      value: BroadcastFlowType.flow,
      label: t("broadcasts.flowType.flow.title"),
      description: t("broadcasts.flowType.flow.description"),
    },
    {
      value: BroadcastFlowType.template,
      label: t("broadcasts.flowType.template.title"),
      description: t("broadcasts.flowType.template.description"),
    },
  ]

  const [selectedType, setSelectedType] = useState<BroadcastFlowType>(
    BroadcastFlowType.flow,
  )

  const handleTypeChange = useCallback(
    (type: BroadcastFlowType) => {
      setSelectedType(type)
      setValue("templateType", type)

      if (type === BroadcastFlowType.flow) {
        setValue("templateId", undefined)
      } else {
        setValue("flowId", undefined)
      }
    },
    [setValue],
  )

  if (subaction !== BroadcastSubaction.whatsappTemplateMessage) {
    return null
  }

  return (
    <div className="grid grid-cols-2 gap-3">
      {flowTypes.map((flowType) => (
        // biome-ignore lint/a11y/useSemanticElements: complex styling requires div
        <div
          className={`flex cursor-pointer items-center gap-3 rounded-lg border p-4 transition-colors ${
            selectedType === flowType.value
              ? "border-primary bg-primary/5"
              : "border-gray-200 hover:border-gray-300"
          }`}
          key={flowType.value}
          onClick={() => handleTypeChange(flowType.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault()
              handleTypeChange(flowType.value)
            }
          }}
          role="button"
          tabIndex={0}
        >
          <div
            className={`flex h-5 w-5 items-center justify-center rounded-full border-2 ${
              selectedType === flowType.value
                ? "border-primary bg-primary"
                : "border-gray-300"
            }`}
          >
            {selectedType === flowType.value && (
              <div className="h-2 w-2 rounded-full bg-white" />
            )}
          </div>
          <div className="flex-1">
            <div className="font-medium text-sm">{flowType.label}</div>
            <div className="text-gray-500 text-xs">{flowType.description}</div>
          </div>
        </div>
      ))}
    </div>
  )
}

type CreateBroadcastChooseFlowProps = {
  channel: ChannelType
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
  const watchedTemplateType = useWatch({ control, name: "templateType" })
  const watchedSchedulesType = useWatch({ control, name: "schedulesType" })
  const watchedIntegrationWhatsappId = useWatch({
    control,
    name: "integrationWhatsappId",
  })
  const watchedTemplateId = useWatch({ control, name: "templateId" })
  const watchedTemplateData = useWatch({ control, name: "templateData" }) as
    | WaTemplateParams
    | undefined

  const [selectedTemplate, setSelectedTemplate] =
    useState<MessageTemplateWithComponents | null>(null)

  const { integrations } = useIntegrationStore((state) => state)
  const { templates, setIntegrationWhatsappId } = useTemplateStore(
    (state) => state,
  )

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
    setValue("channel", null)
    setValue("subaction", null)
  }, [])

  useEffect(() => {
    if (props.channel) {
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
  }, [props.channel, props.subaction, t])

  useEffect(() => {
    if (watchedIntegrationWhatsappId) {
      setIntegrationWhatsappId(watchedIntegrationWhatsappId)
    }
  }, [watchedIntegrationWhatsappId, setIntegrationWhatsappId])

  useEffect(() => {
    if (watchedTemplateId && templates.length > 0) {
      const template = templates.find((t) => t.id === watchedTemplateId) as
        | MessageTemplateWithComponents
        | undefined
      if (template) {
        setSelectedTemplate(template)
        const initialParams = extractTemplateParams(
          template.components as TemplateComponent[],
        )
        setValue("templateData", initialParams)
      } else {
        setSelectedTemplate(null)
        setValue("templateData", undefined)
      }
    }
  }, [watchedTemplateId, templates, setValue])

  return (
    <Card className="mt-10 w-xl max-w-3xl">
      <CardHeader>
        <CardTitle className="text-xl">{t("broadcasts.details")}</CardTitle>
      </CardHeader>

      <CardContent className="flex flex-col gap-6">
        <Card className="flex gap-2 py-3">
          <CardContent className="flex px-3">
            <div className="flex flex-1 flex-col gap-2">
              <InboxIcon channel={props.channel} label={subactionInfo.name} />
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

        <BroadcastFlowTypeSelector subaction={props.subaction} />

        {props.subaction === BroadcastSubaction.whatsappTemplateMessage && (
          <>
            <ComboboxField
              key="integrationWhatsappId"
              label={t("fields.whatsappChannel.label")}
              name="integrationWhatsappId"
              options={integrations.map((integration) => ({
                label: integration.name,
                value: integration.id,
              }))}
              required={true}
            />

            {watchedTemplateType === BroadcastFlowType.template && (
              <>
                <ComboboxField
                  key="templateId"
                  label={t("fields.templateId.label")}
                  name="templateId"
                  options={templates.map((template) => ({
                    label: `${template.name} (${template.language})`,
                    value: template.id,
                  }))}
                  required={true}
                />

                {selectedTemplate && (
                  <div className="space-y-4">
                    <TemplateParamsForm
                      components={
                        selectedTemplate.components as TemplateComponent[]
                      }
                      parentName="templateData"
                    />
                    <div>
                      <div className="mb-2 font-medium text-xs">
                        {t("flows.fields.preview")}
                      </div>
                      <TemplatePreview
                        bodyParams={watchedTemplateData?.body || []}
                        buttonParams={watchedTemplateData?.button || []}
                        components={
                          selectedTemplate.components as TemplateComponent[]
                        }
                        headerParams={watchedTemplateData?.header || []}
                      />
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}

        {(!watchedTemplateType ||
          watchedTemplateType !== BroadcastFlowType.template) && (
          <ComboboxField
            key="flowId"
            label={t("fields.flowId.label")}
            name="flowId"
            options={flows.map((flow) => ({
              label: flow.name,
              value: flow.id,
            }))}
            required={true}
          />
        )}

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
