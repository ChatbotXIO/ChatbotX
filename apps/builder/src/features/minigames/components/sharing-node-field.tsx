"use client"

import { ComboboxField } from "@chatbotx.io/ui/components/form/combobox-field"
import { useTranslations } from "next-intl"
import { useEffect, useMemo } from "react"
import { useFormContext, useWatch } from "react-hook-form"
import { useFlowNodesSelectOptions } from "@/features/flows/provider/flow-hook"

/**
 * Picks the flow step run for a friend who follows a player's share link.
 * Selecting a node is what turns sharing on — see `sharingNodeId` in
 * `minigamePlayerSettingsSchema`.
 *
 * `sharingFlowId` is never picked directly: it is derived from whichever
 * flow owns the chosen node, mirroring `OutcomeMessageFields`. Unlike that
 * component, clearing the node also clears the flow — leaving a stale
 * `sharingFlowId` behind would make `runRef` look up a flow for a share that
 * is no longer configured.
 */
export function SharingNodeField() {
  const t = useTranslations()
  const { control, setValue } = useFormContext()
  const nodeOptions = useFlowNodesSelectOptions()

  const nodeIdToFlowIdMap = useMemo(() => {
    const map: Record<string, string> = {}
    for (const flowOption of nodeOptions) {
      for (const nodeOption of flowOption.children) {
        map[nodeOption.value] = flowOption.value
      }
    }
    return map
  }, [nodeOptions])

  const nodeId = useWatch({ control, name: "playerSettings.sharingNodeId" })
  const flowId = useWatch({ control, name: "playerSettings.sharingFlowId" })

  useEffect(() => {
    if (!nodeId) {
      if (flowId) {
        setValue("playerSettings.sharingFlowId", null, {
          shouldValidate: true,
        })
      }
      return
    }
    const nextFlowId = nodeIdToFlowIdMap[nodeId]
    if (nextFlowId && nextFlowId !== flowId) {
      setValue("playerSettings.sharingFlowId", nextFlowId, {
        shouldValidate: true,
      })
    }
  }, [nodeId, flowId, nodeIdToFlowIdMap, setValue])

  return (
    <ComboboxField
      description={t("minigames.playerSettings.sharingNodeHint")}
      emptyText={t("actions.noRecordFound")}
      label={t("minigames.playerSettings.sharingNode")}
      name="playerSettings.sharingNodeId"
      options={nodeOptions}
      placeholder={t("fields.steps.placeholder")}
    />
  )
}
