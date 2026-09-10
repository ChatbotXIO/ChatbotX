"use client"

import {
  type BroadcastScheduleType,
  type BroadcastSubaction,
  broadcastChannelCapabilities,
  broadcastFlowTypes,
  broadcastSubactions,
  type ChannelType,
  findBroadcastChannelCapability,
  isTemplateBroadcastSubaction,
} from "@chatbotx.io/database/partials"
import { stepTypes } from "@chatbotx.io/flow-config"
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
import { updateDraftBroadcastAction } from "@/features/broadcasts/actions/update-draft-broadcast.action"
import { BroadcastAudiencePreviewDialog } from "@/features/broadcasts/components/broadcast-audience-preview-dialog"
import { BroadcastConfirmDialog } from "@/features/broadcasts/components/broadcast-confirm-dialog"
import {
  type BroadcastTargetRequest,
  createBroadcastRequest,
} from "@/features/broadcasts/schema/action"
import { useWorkspaceId } from "@/hooks/routing"
import { ContactFilter } from "../contact-filter"
import type { ContactFilterCriteria } from "../contact-filter/schema"
import { useContactStore } from "../contacts/provider/contact-store-context"
import { useFlowStore } from "../flows/provider/flow-store-context"
import { InboxIcon } from "../inboxes/components/inbox-icon"
import { useInboxStore } from "../inboxes/provider/inbox-store-context"
import { BroadcastFlowTargets } from "./components/broadcast-flow-targets"
import { BroadcastFlowTypeSelector } from "./components/broadcast-flow-type-selector"
import { BroadcastInboxMultiSelect } from "./components/broadcast-inbox-multi-select"
import { BroadcastTemplateTargets } from "./components/broadcast-template-targets"
import { getBroadcastExcludedFilterFields } from "./lib/broadcast-filter-fields"
import {
  hasSameTargetReferences,
  resolveAudienceInboxIds,
  syncTargetsWithInboxIds,
} from "./lib/broadcast-targets"
import {
  buildCreateBroadcastDefaultValues,
  type EditBroadcastDraft,
} from "./lib/create-broadcast-defaults"

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
  /** Pages preselected by a deep-link (resolved server-side from the integration). */
  initialInboxIds?: string[]
  initialContactFilter?: ContactFilterCriteria
  /**
   * Edit mode: an existing `draft` reopened from the list. The same schema and
   * footer apply — "Save as draft" keeps it a draft, "Confirm" schedules it —
   * only the bound action and the success toast differ.
   */
  editDraft?: EditBroadcastDraft
}

export function CreateBroadcastForm({
  canViewEmailAndPhone = true,
  workspaceId,
  initialChannel,
  initialInboxIds,
  initialContactFilter,
  editDraft,
}: CreateBroadcastFormProps) {
  const t = useTranslations()
  const router = useRouter()

  const { appendFilter, resetFilter, getAllActiveFlows } = useFlowStore(
    (state) => state,
  )

  const isEditing = Boolean(editDraft)

  const { form, handleSubmitWithAction } = useHookFormAction(
    editDraft
      ? updateDraftBroadcastAction.bind(null, workspaceId, editDraft.id)
      : createBroadcastAction.bind(null, workspaceId),
    zodResolver(createBroadcastRequest),
    {
      actionProps: {
        onSuccess: ({ data }) => {
          toast.success(
            t(
              isEditing ? "messages.updatedSuccess" : "messages.createdSuccess",
              {
                feature: t(
                  data?.status === "draft"
                    ? "broadcasts.status.draft"
                    : "fields.broadcast.label",
                ),
              },
            ),
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
        defaultValues:
          editDraft?.defaultValues ??
          buildCreateBroadcastDefaultValues({
            initialChannel,
            initialInboxIds,
            initialContactFilter,
          }),
      },
      errorMapProps: {},
    },
  )

  const handleSaveAsDraft = async (): Promise<void> => {
    form.setValue("saveAsDraft", true, { shouldDirty: false })
    try {
      await handleSubmitWithAction()
    } finally {
      // If validation or the action itself fails, `saveAsDraft` must not
      // stay `true` — otherwise a later Enter-key submit (which reuses this
      // same form's onSubmit) would silently create a draft instead of
      // sending.
      form.setValue("saveAsDraft", false, { shouldDirty: false })
    }
  }

  const watchedSubAction = useWatch({
    control: form.control,
    name: "subaction",
  })
  const watchedChannel = useWatch({
    control: form.control,
    name: "channel",
  })
  const watchedInboxIds = useWatch({
    control: form.control,
    name: "inboxIds",
  }) as string[] | undefined
  const selectedWhatsappIntegrationIds = useSelectedWhatsappIntegrationIds(
    watchedInboxIds ?? [],
  )

  useEffect(() => {
    if (watchedSubAction === broadcastSubactions.enum.whatsappTemplateMessage) {
      appendFilter({
        startType: stepTypes.enum.sendWaTemplateMessage,
        integrationWhatsappIds: selectedWhatsappIntegrationIds,
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
    selectedWhatsappIntegrationIds,
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
              hydrated={
                editDraft && { targets: editDraft.defaultValues.targets }
              }
              onSaveAsDraft={handleSaveAsDraft}
              subaction={watchedSubAction}
            />
          )}
        </form>
      </Form>
    </div>
  )
}

/**
 * WhatsApp integration ids of the selected pages, memoised by value so the
 * flow-filter effect only re-runs when the selection actually changes.
 */
function useSelectedWhatsappIntegrationIds(inboxIds: string[]): string[] {
  const inboxes = useInboxStore((state) => state.inboxes)
  const key = inboxIds.join(",")
  // biome-ignore lint/correctness/useExhaustiveDependencies: `key` stands in for `inboxIds` by value
  return useMemo(
    () =>
      inboxes.flatMap((inbox) =>
        inboxIds.includes(inbox.id) && inbox.integrationWhatsapp
          ? [inbox.integrationWhatsapp.id]
          : [],
      ),
    [inboxes, key],
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

type CreateBroadcastChooseFlowProps = {
  canViewEmailAndPhone: boolean
  channel: ChannelType
  /**
   * Targets an edited draft was hydrated with, so each page's template effect
   * can tell a still-hydrated selection from one the user changed. Absent when
   * creating.
   */
  hydrated?: { targets: BroadcastTargetRequest[] }
  onSaveAsDraft: () => Promise<void>
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

  const { control, setValue, getValues, formState } = useFormContext()
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
  const watchedInboxIds = (useWatch({ control, name: "inboxIds" }) ??
    []) as string[]
  const watchedTargets = (useWatch({ control, name: "targets" }) ??
    []) as BroadcastTargetRequest[]
  const watchedContactFilter = useWatch({ control, name: "contactFilter" })

  const isTemplateSubaction = isTemplateBroadcastSubaction(props.subaction)
  const sendsTemplate = watchedTemplateType === broadcastFlowTypes.enum.template

  // `targets` mirrors the page multi-select: keyed by value so the effect
  // only runs when the selection changes, not on every render.
  const inboxIdsKey = watchedInboxIds.join(",")
  // biome-ignore lint/correctness/useExhaustiveDependencies: `inboxIdsKey` stands in for `watchedInboxIds` by value
  useEffect(() => {
    if (!isTemplateSubaction) {
      return
    }
    const currentTargets = (getValues("targets") ??
      []) as BroadcastTargetRequest[]
    const synced = syncTargetsWithInboxIds(currentTargets, watchedInboxIds)
    if (!hasSameTargetReferences(currentTargets, synced)) {
      setValue("targets", synced, { shouldValidate: true })
    }
  }, [inboxIdsKey, isTemplateSubaction, getValues, setValue])

  const audienceInboxIds = useMemo(
    () =>
      resolveAudienceInboxIds({
        isTemplateSubaction,
        sendsTemplate,
        inboxIds: watchedInboxIds,
        targets: watchedTargets,
      }),
    [isTemplateSubaction, sendsTemplate, watchedInboxIds, watchedTargets],
  )

  const receiversCountParams = useMemo(
    () => ({
      contactFilter: watchedContactFilter,
      channel: props.channel,
      inboxIds: audienceInboxIds,
      integrationWhatsappId: watchedIntegrationWhatsappId,
      integrationMessengerId: watchedIntegrationMessengerId,
      subaction: props.subaction,
    }),
    [
      watchedContactFilter,
      props.channel,
      props.subaction,
      audienceInboxIds,
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
        // Revalidate: clearing an expired `future` time must refresh
        // `formState.isValid` (mode "onChange" only recomputes on a validated
        // change), otherwise the submit buttons stay disabled on a stale
        // schedule error.
        setValue("schedulesAt", null, { shouldValidate: true })
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
    latestReceiversCountQueryKeyRef.current = receiversCountQueryKey
    setCompletedReceiversCountQueryKey(null)
    fetchReceiversCount(receiversCountParams, receiversCountQueryKey)
  }, [fetchReceiversCount, receiversCountParams, receiversCountQueryKey])

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

          {isTemplateSubaction && (
            <BroadcastInboxMultiSelect channel={props.channel} />
          )}

          {isTemplateSubaction && !sendsTemplate && (
            <BroadcastFlowTargets channel={props.channel} />
          )}

          {!(isTemplateSubaction || sendsTemplate) && (
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

      {isTemplateSubaction && sendsTemplate && (
        <BroadcastTemplateTargets
          channel={props.channel}
          hydratedTargets={props.hydrated?.targets}
          subaction={props.subaction}
        />
      )}

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
            onClick={() => props.onSaveAsDraft()}
            type="button"
            variant="secondary"
          >
            {t("actions.saveAsDraft")}
          </Button>

          <Button
            disabled={!formState.isValid || formState.isSubmitting}
            onClick={() => {
              setValue("saveAsDraft", false, { shouldDirty: false })
              setConfirmOpen(true)
            }}
            type="button"
          >
            {formState.isSubmitting && <Loader2Icon className="animate-spin" />}
            {t("actions.confirm")}
          </Button>

          <BroadcastConfirmDialog
            count={count || 0}
            isReceiversCountLoading={isReceiversCountLoading}
            isSubmitting={formState.isSubmitting}
            isValid={formState.isValid}
            onOpenChange={setConfirmOpen}
            onPreviewReceivers={() => setAudiencePreviewOpen(true)}
            open={confirmOpen}
          />
          <BroadcastAudiencePreviewDialog
            channel={props.channel}
            contactFilter={watchedContactFilter}
            inboxIds={audienceInboxIds}
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
