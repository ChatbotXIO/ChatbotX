"use client"

import type { LifecycleStageModel } from "@chatbotx.io/database/types"
import { Label } from "@chatbotx.io/ui/components/ui/label"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@chatbotx.io/ui/components/ui/select"
import { useTranslations } from "next-intl"
import { useEffect, useMemo, useState } from "react"
import { Controller, useFormContext } from "react-hook-form"
import { listLifecycleStages } from "@/features/lifecycle-stages/queries"
import { useWorkspaceId } from "@/hooks/routing"

const ANY_STAGE_VALUE = "__any__"

type LifecycleStageChangedProps = {
  parentName: string
}

export const LifecycleStageChanged = ({
  parentName,
}: LifecycleStageChangedProps) => {
  const t = useTranslations()
  const workspaceId = useWorkspaceId()
  const { control, register } = useFormContext()
  const [stages, setStages] = useState<LifecycleStageModel[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    listLifecycleStages(workspaceId)
      .then((data) => {
        if (!cancelled) {
          setStages(data)
          setLoading(false)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [workspaceId])

  const { activeStages, lostStages } = useMemo(
    () => ({
      activeStages: stages.filter((s) => !s.isLost),
      lostStages: stages.filter((s) => s.isLost),
    }),
    [stages],
  )

  const renderStageOptions = () => (
    <>
      <SelectItem value={ANY_STAGE_VALUE}>
        <span className="text-muted-foreground">{t("lifecycle.anyStage")}</span>
      </SelectItem>
      {activeStages.length > 0 && (
        <SelectGroup>
          <SelectLabel>{t("lifecycle.activeTitle")}</SelectLabel>
          {activeStages.map((stage) => (
            <SelectItem key={stage.id} value={stage.id}>
              <span className="mr-2">{stage.icon ?? "•"}</span>
              {stage.name}
            </SelectItem>
          ))}
        </SelectGroup>
      )}
      {lostStages.length > 0 && (
        <SelectGroup>
          <SelectLabel>{t("lifecycle.lostTitle")}</SelectLabel>
          {lostStages.map((stage) => (
            <SelectItem key={stage.id} value={stage.id}>
              <span className="mr-2">{stage.icon ?? "•"}</span>
              {stage.name}
            </SelectItem>
          ))}
        </SelectGroup>
      )}
    </>
  )

  return (
    <div className="flex flex-col gap-3">
      {/* Hidden fields to keep RHF wired */}
      <input type="hidden" {...register(`${parentName}.id`)} />
      <input type="hidden" {...register(`${parentName}.type`)} />

      <div className="flex flex-col gap-1.5">
        <Label className="text-muted-foreground text-xs">
          {t("lifecycle.triggerFromStage")}
        </Label>
        <Controller
          control={control}
          name={`${parentName}.value.fromStageId`}
          render={({ field }) => (
            <Select
              disabled={loading}
              onValueChange={(v) =>
                field.onChange(v === ANY_STAGE_VALUE ? "" : v)
              }
              value={field.value ? field.value : ANY_STAGE_VALUE}
            >
              <SelectTrigger className="h-9 w-full">
                <SelectValue placeholder={t("lifecycle.anyStage")} />
              </SelectTrigger>
              <SelectContent>{renderStageOptions()}</SelectContent>
            </Select>
          )}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label className="text-muted-foreground text-xs">
          {t("lifecycle.triggerToStage")}
        </Label>
        <Controller
          control={control}
          name={`${parentName}.sourceId`}
          render={({ field }) => (
            <Select
              disabled={loading}
              onValueChange={(v) =>
                field.onChange(v === ANY_STAGE_VALUE ? "" : v)
              }
              value={field.value ? field.value : ANY_STAGE_VALUE}
            >
              <SelectTrigger className="h-9 w-full">
                <SelectValue placeholder={t("lifecycle.anyStage")} />
              </SelectTrigger>
              <SelectContent>{renderStageOptions()}</SelectContent>
            </Select>
          )}
        />
      </div>
    </div>
  )
}
