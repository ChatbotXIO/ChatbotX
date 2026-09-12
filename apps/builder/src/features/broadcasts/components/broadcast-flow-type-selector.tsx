"use client"

import type { BroadcastSubaction } from "@chatbotx.io/database/partials"
import {
  type BroadcastFlowType,
  broadcastFlowTypes,
  isTemplateBroadcastSubaction,
} from "@chatbotx.io/utils/broadcast"
import { useTranslations } from "next-intl"
import { useCallback, useState } from "react"
import { useFormContext } from "react-hook-form"
import {
  clearTargetFlows,
  clearTargetTemplates,
} from "../lib/broadcast-targets"

/**
 * The Flow-vs-Template radio for a template-capable subaction. Switching sides
 * clears the payload of the side being left so a broadcast never carries both a
 * flow and a template. The switch rewrites fields programmatically, so — under
 * the form's `mode: "onChange"`, where `formState.isValid` only refreshes on a
 * validated change — the final `setValue` of each branch runs the resolver;
 * otherwise the submit buttons could stay disabled on the pre-switch validity.
 */
export function BroadcastFlowTypeSelector({
  subaction,
}: {
  subaction: BroadcastSubaction | null
}) {
  const t = useTranslations()
  const { setValue, getValues } = useFormContext()
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

  // Seeded from the form so an edited draft opens on the half it was built
  // with; a create form has no `templateType` yet and falls back to `flow`.
  const [selectedType, setSelectedType] = useState<BroadcastFlowType>(() => {
    const prefilled = broadcastFlowTypes.safeParse(getValues("templateType"))
    return prefilled.success ? prefilled.data : broadcastFlowTypes.enum.flow
  })

  const handleTypeChange = useCallback(
    (type: BroadcastFlowType) => {
      setSelectedType(type)
      setValue("templateType", type)

      if (type === broadcastFlowTypes.enum.flow) {
        setValue("templateId", undefined)
        // Leaving `templateData` behind would persist a template payload on a
        // flow broadcast; the service nulls it too, this keeps the form honest.
        setValue("templateData", undefined)
        setValue("buttons", [])
        setValue("targets", clearTargetTemplates(getValues("targets") ?? []), {
          shouldValidate: true,
        })
      } else {
        setValue("flowId", undefined)
        setValue("targets", clearTargetFlows(getValues("targets") ?? []), {
          shouldValidate: true,
        })
      }
    },
    [setValue, getValues],
  )

  if (!isTemplateBroadcastSubaction(subaction)) {
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
