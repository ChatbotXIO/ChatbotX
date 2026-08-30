"use client"

import {
  isMinigameProbabilityTotalValid,
  type MinigamePrizeSettings,
} from "@chatbotx.io/database/partials"
import { InputNumberField } from "@chatbotx.io/ui/components/form/input-number-field"
import { Badge } from "@chatbotx.io/ui/components/ui/badge"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { createId } from "@chatbotx.io/utils"
import { PencilIcon, PlusIcon, TrashIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { useFieldArray, useFormContext, useWatch } from "react-hook-form"
import { CustomFieldSelect } from "@/features/custom-fields/custom-field-select"
import { PrizeItemEditDialog } from "./prize-item-edit-dialog"

type EditTarget =
  | { variant: "prize"; index: number }
  | { variant: "nonWinning" }

export function PrizeListEditor({ workspaceId }: { workspaceId: string }) {
  const t = useTranslations()
  const { control } = useFormContext()
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null)

  const { fields, append, remove } = useFieldArray({
    control,
    name: "prizeSettings.prizes",
  })

  const prizeSettings = useWatch({
    control,
    name: "prizeSettings",
  }) as MinigamePrizeSettings

  const winProbability = prizeSettings.prizes.reduce(
    (sum, prize) => sum + (prize.winRate || 0),
    0,
  )
  const loseProbability = prizeSettings.nonWinning?.loseRate || 0
  const totalProbability = winProbability + loseProbability
  const isTotalValid = isMinigameProbabilityTotalValid(totalProbability)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <span
          className={cn(
            "font-medium",
            isTotalValid ? "text-green-600" : "text-destructive",
          )}
        >
          {t("minigames.prizeSettings.sumOfProbabilities", {
            value: totalProbability,
          })}
        </span>
        <span className="text-muted-foreground">
          {t("minigames.prizeSettings.loseProbability", {
            value: loseProbability,
          })}
        </span>
        <span className="text-muted-foreground">
          {t("minigames.prizeSettings.winProbability", {
            value: winProbability,
          })}
        </span>
      </div>

      <CustomFieldSelect
        clearable
        customFieldTypes={["shortText", "longText"]}
        label={t("minigames.prizeSettings.prizeNameCustomFieldLabel")}
        name="prizeSettings.prizeNameCustomFieldId"
      />

      <div className="flex flex-col gap-2">
        {fields.map((field, index) => (
          <div className="flex items-center gap-3" key={field.id}>
            <Badge
              className="cursor-pointer gap-1.5 rounded-full bg-blue-100 px-3 py-1.5 text-blue-700 hover:bg-blue-200 dark:bg-blue-950 dark:text-blue-300"
              render={
                <button
                  onClick={() => setEditTarget({ variant: "prize", index })}
                  type="button"
                >
                  <span className="w-32 truncate">
                    {prizeSettings.prizes[index]?.name ||
                      t("minigames.prizeItemDialog.prizeNameLabel")}
                  </span>
                  <PencilIcon className="size-3" />
                </button>
              }
            />
            <div className="w-28">
              <InputNumberField
                max={100}
                min={0}
                name={`prizeSettings.prizes.${index}.winRate`}
                suffix="%"
              />
            </div>
            <Button
              aria-label={t("actions.delete")}
              onClick={() => remove(index)}
              size="icon"
              type="button"
              variant="ghost"
            >
              <TrashIcon className="size-4 text-destructive" />
            </Button>
          </div>
        ))}

        <div className="flex items-center gap-3">
          <Badge
            className="cursor-pointer gap-1.5 rounded-full bg-slate-700 px-3 py-1.5 text-white hover:bg-slate-800"
            render={
              <button
                onClick={() => setEditTarget({ variant: "nonWinning" })}
                type="button"
              >
                <span className="max-w-32 truncate">
                  {prizeSettings.nonWinning?.title ||
                    t("minigames.prizeItemDialog.nonWinningTitleLabel")}
                </span>
                <PencilIcon className="size-3" />
              </button>
            }
          />
          <div className="w-28">
            <InputNumberField
              max={100}
              min={0}
              name="prizeSettings.nonWinning.loseRate"
              suffix="%"
            />
          </div>
          <div className="size-9 shrink-0" />
        </div>
      </div>

      <Button
        className="w-fit"
        onClick={() =>
          append({
            id: createId(),
            name: "",
            icon: { mode: "file", url: "" },
            winRate: 0,
          })
        }
        type="button"
        variant="outline"
      >
        <PlusIcon className="size-4" />
        {t("minigames.prizeSettings.newPrize")}
      </Button>

      {editTarget && (
        <PrizeItemEditDialog
          onOpenChange={(open) => {
            if (!open) {
              setEditTarget(null)
            }
          }}
          open={true}
          workspaceId={workspaceId}
          {...editTarget}
        />
      )}
    </div>
  )
}
