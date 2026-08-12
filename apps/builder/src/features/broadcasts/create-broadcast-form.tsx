"use client"

import {
  type BroadcastFlowType,
  type BroadcastScheduleType,
  type BroadcastSubaction,
  broadcastChannelCapabilities,
  broadcastFlowTypes,
  broadcastSubactions,
  type ChannelType,
  findBroadcastChannelCapability,
} from "@chatbotx.io/database/partials"
import {
  extractMessengerFlowButtons,
  extractMessengerTemplateParams,
  extractTemplateParams,
  type MessengerTemplateComponent,
  type MessengerTemplateParams,
  stepTypes,
  type TemplateComponent,
  type WaTemplateParams,
} from "@chatbotx.io/flow-config"
import { ComboboxField } from "@chatbotx.io/ui/components/form/combobox-field"
import { DateTimePickerField } from "@chatbotx.io/ui/components/form/date-picker-field"
import { SelectField } from "@chatbotx.io/ui/components/form/select-field"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@chatbotx.io/ui/components/ui/card"
import { Form } from "@chatbotx.io/ui/components/ui/form"
import { useDebouncedCallback } from "@chatbotx.io/ui/hooks/use-debounced-callback"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { add } from "date-fns"
import { Loader2Icon, XIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useFormContext, useWatch } from "react-hook-form"
import { toast } from "sonner"
import { createBroadcastAction } from "@/features/broadcasts/actions/create-broadcast.action"
import { BroadcastAudiencePreviewDialog } from "@/features/broadcasts/components/broadcast-audience-preview-dialog"
import { BroadcastConfirmDialog } from "@/features/broadcasts/components/broadcast-confirm-dialog"
import { createBroadcastRequest } from "@/features/broadcasts/schemas/action"
import { useWorkspaceId } from "@/hooks/routing"
import { ContactFilter } from "../contact-filter"
import type { ContactFilterCriteria } from "../contact-filter/schemas"
import { useContactStore } from "../contacts/provider/contact-store-context"
import { useFlowStore } from "../flows/provider/flow-store-context"
import { useFlowTemplate } from "../flows/react-flow/stores/flow-template-store-provider"
import { InboxIcon } from "../inboxes/components/inbox-icon"
import { MessengerTemplateParamsForm } from "../integration-messenger/message-templates/components/template-params-form"
import { MessengerTemplatePreview } from "../integration-messenger/message-templates/components/template-preview"
import { TemplateParamsForm } from "../integration-whatsapp/message-templates/components/template-params-form"
import { TemplatePreview } from "../integration-whatsapp/message-templates/components/template-preview"
import type { MessageTemplateWithComponents } from "../integration-whatsapp/message-templates/schema/resource"
import { useIntegrationStore } from "../integration-whatsapp/provider/integration-store-context"
import { MessengerBroadcastFlowButtons } from "./components/messenger-broadcast-flow-buttons"
import { getBroadcastExcludedFilterFields } from "./lib/broadcast-filter-fields"
import { buildCreateBroadcastDefaultValues } from "./lib/create-broadcast-defaults"

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
  broadcastChannelCapabilities.map((capability) => {
    const subactions = capability.subactions.map((subaction) => ({
      value: subaction,
      name: t(`broadcasts.${subaction}.title`),
      description: t(`broadcasts.${subaction}.description`),
    }))

    return {
      value: capability.channel,
      // Channel-level copy is not rendered (the channel step shows only the icon);
      // per-subaction title/description drive every visible label.
      description: "",
      subactions,
    }
  }) satisfies BroadcastConfig[]

type CreateBroadcastFormProps = {
  canViewEmailAndPhone?: boolean
  workspaceId: string
  /**
   * Deep-link prefill (e.g. Ads Analytics' per-ad "Retarget → Send WhatsApp
   * broadcast → {segment}"). When `initialChannel` is set, the channel-picker
   * step is skipped since `watchedChannel` is already non-empty.
   */
  initialChannel?: ChannelType
  initialIntegrationWhatsappId?: string
  initialContactFilter?: ContactFilterCriteria
}

export function CreateBroadcastForm({
  canViewEmailAndPhone = true,
  workspaceId,
  initialChannel,
  initialIntegrationWhatsappId,
  initialContactFilter,
}: CreateBroadcastFormProps) {
  const t = useTranslations()
  const router = useRouter()

  const { appendFilter, resetFilter, getAllActiveFlows } = useFlowStore(
    (state) => state,
  )

  const { form, handleSubmitWithAction } = useHookFormAction(
    createBroadcastAction.bind(null, workspaceId),
    zodResolver(createBroadcastRequest),
    {
      actionProps: {
        onSuccess: () => {
          toast.success(
            t("messages.createdSuccess", {
              feature: t("fields.broadcast.label"),
            }),
          )
          router.push(`/space/${workspaceId}/broadcasts`)
        },
        onError: ({ error }) => {
          if (error.serverError) {
            toast.error(error.serverError)
          }
        },
      },
      formProps: {
        mode: "onChange",
        defaultValues: buildCreateBroadcastDefaultValues({
          initialChannel,
          initialIntegrationWhatsappId,
          initialContactFilter,
        }),
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
    if (watchedSubAction === broadcastSubactions.enum.whatsappTemplateMessage) {
      appendFilter({
        startType: stepTypes.enum.sendWaTemplateMessage,
        integrationWhatsappId: watchedIntegrationWhatsappId,
      })
      getAllActiveFlows()
    } else if (
      watchedSubAction === broadcastSubactions.enum.messengerTemplateMessage
    ) {
      appendFilter({
        startType: stepTypes.enum.sendMessengerTemplateMessage,
      })
      getAllActiveFlows()
    } else {
      resetFilter()
      getAllActiveFlows()
    }
    return
  }, [
    watchedSubAction,
    watchedIntegrationWhatsappId,
    appendFilter,
    resetFilter,
    getAllActiveFlows,
  ])

  return (
    <div className="flex flex-col items-center overflow-y-auto px-10 py-10">
      <Form {...form}>
        <form
          className="mx-auto mt-10 mb-10 w-full max-w-2xl flex-1 space-y-4"
          id="broadcast-form"
          onSubmit={handleSubmitWithAction}
        >
          {!watchedChannel && <CreateBroadcastChooseChannel />}

          {watchedChannel && !watchedSubAction && (
            <CreateBroadcastChooseSubaction channel={watchedChannel} />
          )}

          {watchedChannel && watchedSubAction && (
            <CreateBroadcastChooseFlow
              canViewEmailAndPhone={canViewEmailAndPhone}
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

  const workspaceId = useWorkspaceId()

  const { setValue } = useFormContext()

  const configs = useMemo(() => getConfigs(t), [t])

  const handleChooseChannel = useCallback(
    (channel: ChannelType) => {
      setValue("channel", channel)
      const capability = findBroadcastChannelCapability(channel)
      const mustPickSubaction = (capability?.subactions.length ?? 0) > 1
      setValue(
        "subaction",
        mustPickSubaction ? null : (capability?.defaultSubaction ?? null),
      )
    },
    [setValue],
  )

  const handleBack = useCallback(() => {
    router.push(`/space/${workspaceId}/broadcasts`)
  }, [router, workspaceId])

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">{t("actions.chooseChannel")}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {configs.map((config) => (
          <div className="flex w-full items-center gap-2" key={config.value}>
            <div className="min-w-0 flex-1">
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
    <Card>
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
              className="ms-auto"
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
      value: broadcastFlowTypes.enum.flow,
      label: t("broadcasts.flowType.flow.title"),
      description: t("broadcasts.flowType.flow.description"),
    },
    {
      value: broadcastFlowTypes.enum.template,
      label: t("broadcasts.flowType.template.title"),
      description: t("broadcasts.flowType.template.description"),
    },
  ]

  const [selectedType, setSelectedType] = useState<BroadcastFlowType>(
    broadcastFlowTypes.enum.flow,
  )

  const handleTypeChange = useCallback(
    (type: BroadcastFlowType) => {
      setSelectedType(type)
      setValue("templateType", type)

      if (type === broadcastFlowTypes.enum.flow) {
        setValue("templateId", undefined)
        setValue("buttons", [])
      } else {
        setValue("flowId", undefined)
      }
    },
    [setValue],
  )

  if (
    subaction !== broadcastSubactions.enum.whatsappTemplateMessage &&
    subaction !== broadcastSubactions.enum.messengerTemplateMessage
  ) {
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
  canViewEmailAndPhone: boolean
  channel: ChannelType
  subaction: BroadcastSubaction
}

function CreateBroadcastChooseFlow(props: CreateBroadcastChooseFlowProps) {
  const t = useTranslations()
  const router = useRouter()
  const {
    contactInboxesCount: count,
    getContactInboxesCount,
    loadingInboxesCount,
  } = useContactStore((state) => state)
  const [audiencePreviewOpen, setAudiencePreviewOpen] = useState(false)
  const latestReceiversCountQueryKeyRef = useRef<string | null>(null)
  const [completedReceiversCountQueryKey, setCompletedReceiversCountQueryKey] =
    useState<string | null>(null)

  const workspaceId = useWorkspaceId()

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
    value: broadcastSubactions.enum.allContacts,
    name: "",
    description: "",
  })

  const { control, setValue, formState } = useFormContext()
  const watchedTemplateType = useWatch({ control, name: "templateType" })
  const watchedSchedulesType = useWatch({ control, name: "schedulesType" })
  const watchedIntegrationWhatsappId = useWatch({
    control,
    name: "integrationWhatsappId",
  })
  const watchedIntegrationMessengerId = useWatch({
    control,
    name: "integrationMessengerId",
  })
  const watchedTemplateId = useWatch({ control, name: "templateId" })
  const watchedContactFilter = useWatch({ control, name: "contactFilter" })
  const watchedTemplateData = useWatch({ control, name: "templateData" }) as
    | WaTemplateParams
    | undefined
  const watchedMessengerTemplateData = watchedTemplateData as
    | MessengerTemplateParams
    | undefined

  const receiversCountParams = useMemo(
    () => ({
      contactFilter: watchedContactFilter,
      channel: props.channel,
      integrationWhatsappId: watchedIntegrationWhatsappId,
      integrationMessengerId: watchedIntegrationMessengerId,
      subaction: props.subaction,
    }),
    [
      watchedContactFilter,
      props.channel,
      props.subaction,
      watchedIntegrationWhatsappId,
      watchedIntegrationMessengerId,
    ],
  )

  const receiversCountQueryKey = useMemo(
    () => JSON.stringify(receiversCountParams),
    [receiversCountParams],
  )

  const fetchReceiversCount = useDebouncedCallback(
    async (
      params: typeof receiversCountParams,
      queryKey: string,
    ): Promise<void> => {
      await getContactInboxesCount(params)

      if (latestReceiversCountQueryKeyRef.current === queryKey) {
        setCompletedReceiversCountQueryKey(queryKey)
      }
    },
    300,
  )

  const isReceiversCountLoading =
    loadingInboxesCount ||
    completedReceiversCountQueryKey !== receiversCountQueryKey

  const [selectedTemplate, setSelectedTemplate] =
    useState<MessageTemplateWithComponents | null>(null)

  const { integrations } = useIntegrationStore((state) => state)
  const whatsappTemplates = useFlowTemplate((s) => s.whatsappTemplates)
  const setIntegrationWhatsappId = useFlowTemplate(
    (s) => s.setIntegrationWhatsappId,
  )

  const messengerTemplatesData = useFlowTemplate(
    (state) => state.messengerTemplates,
  )

  const messengerIntegrationOptions = useMemo(() => {
    const map = new Map<string, string>()
    for (const template of messengerTemplatesData) {
      if (template.integrationMessenger) {
        map.set(
          template.integrationMessenger.id,
          template.integrationMessenger.name,
        )
      }
    }
    return [...map.entries()].map(([value, label]) => ({ value, label }))
  }, [messengerTemplatesData])

  const filteredMessengerTemplates = useMemo(
    () =>
      messengerTemplatesData.filter(
        (template) =>
          template.integrationMessengerId === watchedIntegrationMessengerId,
      ),
    [messengerTemplatesData, watchedIntegrationMessengerId],
  )

  const [selectedMessengerTemplate, setSelectedMessengerTemplate] = useState<
    (typeof messengerTemplatesData)[number] | null
  >(null)

  const [confirmOpen, setConfirmOpen] = useState(false)

  const excludeFields = useMemo(
    () =>
      getBroadcastExcludedFilterFields({
        canViewEmailAndPhone: props.canViewEmailAndPhone,
        channel: props.channel,
        subaction: props.subaction,
      }),
    [props.canViewEmailAndPhone, props.channel, props.subaction],
  )

  const handleCancel = useCallback(() => {
    router.push(`/space/${workspaceId}/broadcasts`)
  }, [router, workspaceId])

  const handleScheduleTypeChange = useCallback(
    (value: BroadcastScheduleType) => {
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
    setValue("buttons", [])
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
      // Clear stale template selection from previous integration
      setValue("templateId", undefined)
      setValue("templateData", undefined)
      setSelectedTemplate(null)
    }
  }, [watchedIntegrationWhatsappId, setIntegrationWhatsappId, setValue])

  useEffect(() => {
    latestReceiversCountQueryKeyRef.current = receiversCountQueryKey
    setCompletedReceiversCountQueryKey(null)
    fetchReceiversCount(receiversCountParams, receiversCountQueryKey)
  }, [fetchReceiversCount, receiversCountParams, receiversCountQueryKey])

  useEffect(() => {
    if (watchedTemplateId && whatsappTemplates.length > 0) {
      const template = whatsappTemplates.find(
        (t) => t.id === watchedTemplateId,
      ) as MessageTemplateWithComponents | undefined
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
  }, [watchedTemplateId, whatsappTemplates, setValue])

  useEffect(() => {
    if (
      props.subaction !== broadcastSubactions.enum.messengerTemplateMessage ||
      !watchedTemplateId ||
      messengerTemplatesData.length === 0
    ) {
      return
    }

    const template = messengerTemplatesData.find(
      (t) => t.id === watchedTemplateId,
    )
    if (template) {
      setSelectedMessengerTemplate(template)
      const initialParams = extractMessengerTemplateParams(
        template.components as MessengerTemplateComponent[],
        template.parameterFormat as "POSITIONAL" | "NAMED",
      )
      setValue("templateData", initialParams)
      // seed flow buttons from template
      setValue(
        "buttons",
        extractMessengerFlowButtons(
          template.components as MessengerTemplateComponent[],
        ).map((b) => ({ id: b.id, label: b.label, flowId: "" })),
      )
    } else {
      setSelectedMessengerTemplate(null)
      setValue("templateData", undefined)
      setValue("buttons", []) // clear buttons
    }
  }, [props.subaction, watchedTemplateId, messengerTemplatesData, setValue])

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <Card>
        <CardContent className="flex px-3">
          <div className="flex min-w-0 flex-1 flex-col gap-2">
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

      <Card>
        <CardContent className="flex flex-col gap-6">
          <BroadcastFlowTypeSelector subaction={props.subaction} />

          {props.subaction ===
            broadcastSubactions.enum.whatsappTemplateMessage && (
            <>
              <ComboboxField
                emptyText={t("actions.noRecordFound")}
                key="integrationWhatsappId"
                label={t("fields.whatsappChannel.label")}
                name="integrationWhatsappId"
                options={integrations.map((integration) => ({
                  label: integration.name,
                  value: integration.id,
                }))}
                placeholder={t("actions.pleaseSelect")}
                required={true}
              />

              {watchedTemplateType === broadcastFlowTypes.enum.template && (
                <>
                  <ComboboxField
                    emptyText={t("actions.noRecordFound")}
                    key="templateId"
                    label={t("fields.templateId.label")}
                    name="templateId"
                    options={whatsappTemplates.map((template) => ({
                      label: `${template.name} (${template.language})`,
                      value: template.id,
                    }))}
                    placeholder={t("actions.pleaseSelect")}
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

          {props.subaction ===
            broadcastSubactions.enum.messengerTemplateMessage && (
            <>
              <ComboboxField
                emptyText={t("actions.noRecordFound")}
                key="integrationMessengerId"
                label={t("fields.messengerChannel.label")}
                name="integrationMessengerId"
                options={messengerIntegrationOptions}
                placeholder={t("actions.pleaseSelect")}
                required={true}
              />

              {watchedTemplateType === broadcastFlowTypes.enum.template && (
                <>
                  <ComboboxField
                    emptyText={t("actions.noRecordFound")}
                    key="messengerTemplateId"
                    label={t("fields.messengerTemplateId.label")}
                    name="templateId"
                    options={filteredMessengerTemplates.map((template) => ({
                      label: `${template.name} (${template.language})`,
                      value: template.id,
                    }))}
                    placeholder={t("actions.pleaseSelect")}
                    required={true}
                  />

                  {selectedMessengerTemplate && (
                    <div className="space-y-4">
                      <MessengerTemplateParamsForm
                        components={
                          selectedMessengerTemplate.components as MessengerTemplateComponent[]
                        }
                        parameterFormat={
                          selectedMessengerTemplate.parameterFormat as
                            | "POSITIONAL"
                            | "NAMED"
                        }
                        parentName="templateData"
                      />
                      <div>
                        <div className="mb-2 font-medium text-xs">
                          {t("flows.fields.preview")}
                        </div>
                        <MessengerTemplatePreview
                          bodyParams={watchedMessengerTemplateData?.body || []}
                          buttonParams={
                            watchedMessengerTemplateData?.button || []
                          }
                          components={
                            selectedMessengerTemplate.components as MessengerTemplateComponent[]
                          }
                          headerParams={
                            watchedMessengerTemplateData?.header || []
                          }
                        />
                      </div>
                      <MessengerBroadcastFlowButtons />
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {(!watchedTemplateType ||
            watchedTemplateType !== broadcastFlowTypes.enum.template) && (
            <ComboboxField
              emptyText={t("actions.noRecordFound")}
              key="flowId"
              label={t("fields.flowId.label")}
              name="flowId"
              options={flows.map((flow) => ({
                label: flow.name,
                value: flow.id,
              }))}
              placeholder={t("actions.pleaseSelect")}
              required={true}
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-6">
          <SelectField
            defaultValue="now"
            label={t("fields.schedule.label")}
            name="schedulesType"
            options={schedulesOptions}
            required
            triggerValueChange={(value) =>
              handleScheduleTypeChange(value as BroadcastScheduleType)
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
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-6">
          <ContactFilter
            excludeFields={excludeFields}
            inboxChannel={props.channel}
            parentName="contactFilter"
          />
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <Button
          className="h-auto px-0 text-gray-500 text-sm"
          disabled={isReceiversCountLoading || !count}
          onClick={() => setAudiencePreviewOpen(true)}
          type="button"
          variant="link"
        >
          {isReceiversCountLoading ? (
            <span className="inline-flex items-center gap-1.5">
              <Loader2Icon className="size-3 animate-spin" />
              {t("broadcasts.receiversLoading")}
            </span>
          ) : (
            t("broadcasts.receiversCount", {
              count: count || 0,
            })
          )}
        </Button>
        <div className="flex justify-end gap-2">
          <Button onClick={handleCancel} type="button" variant="outline">
            {t("actions.cancel")}
          </Button>

          <Button
            disabled={!formState.isValid || formState.isSubmitting}
            onClick={() => setConfirmOpen(true)}
            type="button"
          >
            {formState.isSubmitting && <Loader2Icon className="animate-spin" />}
            {t("actions.confirm")}
          </Button>

          <BroadcastConfirmDialog
            count={count || 0}
            isReceiversCountLoading={isReceiversCountLoading}
            isSubmitting={formState.isSubmitting}
            onOpenChange={setConfirmOpen}
            onPreviewReceivers={() => setAudiencePreviewOpen(true)}
            open={confirmOpen}
          />
          <BroadcastAudiencePreviewDialog
            channel={props.channel}
            contactFilter={watchedContactFilter}
            integrationMessengerId={watchedIntegrationMessengerId}
            integrationWhatsappId={watchedIntegrationWhatsappId}
            onOpenChange={setAudiencePreviewOpen}
            open={audiencePreviewOpen}
            subaction={props.subaction}
            total={count || 0}
            workspaceId={workspaceId}
          />
        </div>
      </div>
    </div>
  )
}
