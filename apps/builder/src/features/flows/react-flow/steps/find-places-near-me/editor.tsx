"use client"

import { findUpstreamLocationFieldKeys } from "@chatbotx.io/flow-config"
import { SelectField } from "@chatbotx.io/ui/components/form/select-field"
import { useEdges, useNodes } from "@xyflow/react"
import { MapPinIcon, TriangleAlertIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useMemo } from "react"
import { useFormContext, useWatch } from "react-hook-form"
import { usePlaceCategoryOptions } from "@/features/places-near-me/lib/use-place-category-options"
import { BaseStepEditor } from "../base/editor"

/** Select value standing in for `placeCategoryId: null` (all locations). */
const ALL_LOCATIONS = "__all__"

const FindPlacesNearMeStepEditor = ({ parentName }: { parentName: string }) => {
  const t = useTranslations()
  const { setValue } = useFormContext()
  const nodes = useNodes()
  const edges = useEdges()
  const { options: categoryOptions } = usePlaceCategoryOptions()
  const stepId = useWatch({ name: `${parentName}.id` }) as string | undefined
  const placeCategoryId = useWatch({
    name: `${parentName}.placeCategoryId`,
  }) as string | null | undefined

  const hasLocationSource = useMemo(
    () =>
      stepId
        ? findUpstreamLocationFieldKeys({ nodes, edges, stepId }).length > 0
        : false,
    [nodes, edges, stepId],
  )

  const options = useMemo(
    () => [
      {
        label: t("flows.findPlacesNearMe.allLocations"),
        value: ALL_LOCATIONS,
      },
      ...categoryOptions,
    ],
    [t, categoryOptions],
  )

  return (
    <BaseStepEditor
      icon={MapPinIcon}
      title={t("flows.actions.findPlacesNearMe")}
    >
      <div className="flex w-[243px] flex-col gap-1.5 overflow-hidden">
        <SelectField
          label={t("flows.findPlacesNearMe.category")}
          name={`${parentName}.placeCategoryId`}
          onValueChange={(value) =>
            setValue(
              `${parentName}.placeCategoryId`,
              value === ALL_LOCATIONS ? null : value,
              { shouldDirty: true },
            )
          }
          options={options}
          value={placeCategoryId ?? ALL_LOCATIONS}
        />
        <p className="text-muted-foreground text-xs">
          {t("flows.findPlacesNearMe.whatsappOnly")}
        </p>
        {hasLocationSource ? null : (
          <p className="flex items-start gap-1.5 rounded-md bg-amber-50 px-2 py-1.5 text-amber-900 text-xs dark:bg-amber-950/40 dark:text-amber-200">
            <TriangleAlertIcon className="mt-0.5 size-3 shrink-0" />
            {t("flows.findPlacesNearMe.noLocationSource")}
          </p>
        )}
      </div>
    </BaseStepEditor>
  )
}

export default FindPlacesNearMeStepEditor
