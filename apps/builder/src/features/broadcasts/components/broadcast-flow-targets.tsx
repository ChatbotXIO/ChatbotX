"use client"

import type { ChannelType } from "@chatbotx.io/database/partials"
import { stepTypes } from "@chatbotx.io/flow-config"
import { ComboboxField } from "@chatbotx.io/ui/components/form/combobox-field"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@chatbotx.io/ui/components/ui/card"
import { useTranslations } from "next-intl"
import { useMemo } from "react"
import { useFormContext, useWatch } from "react-hook-form"
import { useFlowStore } from "@/features/flows/provider/flow-store-context"
import { useInboxStore } from "@/features/inboxes/provider/inbox-store-context"
import { useBroadcastPageTemplates } from "../hooks/use-broadcast-page-templates"
import {
  buildTargetFlowOptions,
  type FlowForTargets,
} from "../lib/broadcast-flow-targets"
import type {
  BroadcastPage,
  PageTemplateSummary,
} from "../lib/broadcast-target-groups"
import type { BroadcastTargetRequest } from "../schema/action"

// The template start step a page-bound flow opens with, per channel.
const templateStepTypeByChannel: Partial<Record<ChannelType, string>> = {
  whatsapp: stepTypes.enum.sendWaTemplateMessage,
  messenger: stepTypes.enum.sendMessengerTemplateMessage,
}

type BroadcastFlowTargetCardProps = {
  page: BroadcastPage
  fieldName: string
  flows: readonly FlowForTargets[]
  templatesById: ReadonlyMap<string, PageTemplateSummary>
  stepType: string | undefined
}

/** One page of a multi-page flow broadcast: its name and its flow picker. */
function BroadcastFlowTargetCard({
  page,
  fieldName,
  flows,
  templatesById,
  stepType,
}: BroadcastFlowTargetCardProps) {
  const t = useTranslations()

  const options = useMemo(
    () =>
      stepType
        ? buildTargetFlowOptions({ flows, page, templatesById, stepType })
        : [],
    [flows, page, templatesById, stepType],
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{page.inboxName}</CardTitle>
      </CardHeader>
      <CardContent>
        <ComboboxField
          emptyText={t("actions.noRecordFound")}
          label={t("fields.flow.label")}
          name={`${fieldName}.flowId`}
          options={options}
          placeholder={t("actions.pleaseSelect")}
        />
      </CardContent>
    </Card>
  )
}

/**
 * The flow half of a multi-page broadcast: one independent card per selected
 * page, each with its own flow picker scoped to the flows whose start
 * template belongs to that page. A page left without a flow is allowed — it
 * is simply skipped at send and receiver-count time.
 */
export function BroadcastFlowTargets({ channel }: { channel: ChannelType }) {
  const { control } = useFormContext()
  const inboxes = useInboxStore((state) => state.inboxes)
  const flows = useFlowStore((state) => state.flows)
  const { templatesById } = useBroadcastPageTemplates(channel)

  const inboxIds = (useWatch({ control, name: "inboxIds" }) ?? []) as string[]
  const targets = (useWatch({ control, name: "targets" }) ??
    []) as BroadcastTargetRequest[]

  const pages = useMemo<BroadcastPage[]>(() => {
    const nameById = new Map(inboxes.map((inbox) => [inbox.id, inbox.name]))
    return inboxIds.map((inboxId) => ({
      inboxId,
      inboxName: nameById.get(inboxId) ?? inboxId,
    }))
  }, [inboxes, inboxIds])

  const stepType = templateStepTypeByChannel[channel]

  return (
    <div className="flex flex-col gap-6">
      {pages.map((page) => {
        const fieldIndex = targets.findIndex(
          (target) => target.inboxId === page.inboxId,
        )
        if (fieldIndex < 0) {
          return null
        }

        return (
          <BroadcastFlowTargetCard
            fieldName={`targets.${fieldIndex}`}
            flows={flows}
            key={page.inboxId}
            page={page}
            stepType={stepType}
            templatesById={templatesById}
          />
        )
      })}
    </div>
  )
}
