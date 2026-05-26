"use client"

import type { LifecycleStageModel } from "@chatbotx.io/database/types"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@chatbotx.io/ui/components/ui/select"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { RefreshCwIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useEffect, useMemo, useState } from "react"
import { Controller, useFormContext } from "react-hook-form"
import { listLifecycleStages } from "@/features/lifecycle-stages/queries"
import { useWorkspaceId } from "@/hooks/routing"
import { BaseStepEditor } from "../base/editor"

type UpdateContactLifecycleStageStepEditorProps = {
  parentName: string
}

const UpdateContactLifecycleStageStepEditor = ({
  parentName,
}: UpdateContactLifecycleStageStepEditorProps) => {
  const t = useTranslations()
  const workspaceId = useWorkspaceId()
  const { control, watch, setValue } = useFormContext()
  const [stages, setStages] = useState<LifecycleStageModel[]>([])

  const action: "update" | "remove" = watch(`${parentName}.action`) ?? "update"

  useEffect(() => {
    let cancelled = false
    listLifecycleStages(workspaceId)
      .then((data) => {
        if (!cancelled) {
          setStages(data)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setStages([])
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

  const setAction = (next: "update" | "remove") => {
    setValue(`${parentName}.action`, next, { shouldDirty: true })
    if (next === "remove") {
      // Limpa a stage selecionada pra não validar
      setValue(`${parentName}.lifecycleStageId`, "", { shouldDirty: true })
    }
  }

  return (
    <BaseStepEditor
      icon={RefreshCwIcon}
      title={t("flows.actions.updateContactLifecycleStage")}
    >
      <div className="flex flex-col gap-3">
        <p className="text-muted-foreground text-xs">
          {t("lifecycle.stepHint")}
        </p>

        {/* Modo: Atualizar etapa */}
        <button
          aria-pressed={action === "update"}
          className={cn(
            "rounded-lg border p-3 text-left transition-colors",
            action === "update"
              ? "border-primary bg-primary/5"
              : "border-border hover:bg-accent",
          )}
          onClick={() => setAction("update")}
          type="button"
        >
          <div className="flex items-start gap-2">
            <div
              className={cn(
                "mt-0.5 h-4 w-4 shrink-0 rounded-full border-2",
                action === "update"
                  ? "border-primary bg-primary"
                  : "border-muted-foreground",
              )}
            />
            <div className="flex-1">
              <div className="font-medium text-sm">
                {t("lifecycle.stepUpdateAction")}
              </div>
              <div className="text-muted-foreground text-xs">
                {t("lifecycle.stepUpdateActionHint")}
              </div>
            </div>
          </div>
        </button>

        {/* Modo: Remover etapa */}
        <button
          aria-pressed={action === "remove"}
          className={cn(
            "rounded-lg border p-3 text-left transition-colors",
            action === "remove"
              ? "border-primary bg-primary/5"
              : "border-border hover:bg-accent",
          )}
          onClick={() => setAction("remove")}
          type="button"
        >
          <div className="flex items-start gap-2">
            <div
              className={cn(
                "mt-0.5 h-4 w-4 shrink-0 rounded-full border-2",
                action === "remove"
                  ? "border-primary bg-primary"
                  : "border-muted-foreground",
              )}
            />
            <div className="flex-1">
              <div className="font-medium text-sm">
                {t("lifecycle.stepRemoveAction")}
              </div>
              <div className="text-muted-foreground text-xs">
                {t("lifecycle.stepRemoveActionHint")}
              </div>
            </div>
          </div>
        </button>

        {/* Select de stage quando modo "update" */}
        {action === "update" && (
          <div className="flex flex-col gap-1.5">
            <label
              className="font-medium text-xs"
              htmlFor={`${parentName}.lifecycleStageId`}
            >
              {t("lifecycle.stepStageLabel")}
            </label>
            <Controller
              control={control}
              name={`${parentName}.lifecycleStageId`}
              render={({ field, fieldState }) => (
                <>
                  <Select
                    onValueChange={field.onChange}
                    value={field.value ?? ""}
                  >
                    <SelectTrigger
                      className="w-full"
                      id={`${parentName}.lifecycleStageId`}
                    >
                      <SelectValue
                        placeholder={t("lifecycle.selectPlaceholder")}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {activeStages.length > 0 && (
                        <SelectGroup>
                          <SelectLabel>
                            {t("lifecycle.activeTitle")}
                          </SelectLabel>
                          {activeStages.map((s) => (
                            <SelectItem key={s.id} value={s.id}>
                              <span className="mr-2">{s.icon ?? "•"}</span>
                              {s.name}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      )}
                      {lostStages.length > 0 && (
                        <SelectGroup>
                          <SelectLabel>{t("lifecycle.lostTitle")}</SelectLabel>
                          {lostStages.map((s) => (
                            <SelectItem key={s.id} value={s.id}>
                              <span className="mr-2">{s.icon ?? "•"}</span>
                              {s.name}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      )}
                    </SelectContent>
                  </Select>
                  {fieldState.error?.message && (
                    <span className="text-destructive text-xs">
                      {fieldState.error.message}
                    </span>
                  )}
                </>
              )}
            />
          </div>
        )}
      </div>
    </BaseStepEditor>
  )
}

export default UpdateContactLifecycleStageStepEditor
