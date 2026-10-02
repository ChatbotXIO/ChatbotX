"use client"

import {
  type ButtonType,
  type QuickReplyNextStep,
  quickReplyNextStepHiddenButtonTypes,
} from "@chatbotx.io/flow-config"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@chatbotx.io/ui/components/ui/dialog"
import { ChevronDownIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useCallback, useState } from "react"
import { useFormContext, useWatch } from "react-hook-form"
import { ActiveButton, AllButtonOptions } from "../../button-editor-dialog"
import { useCreateButtonTarget } from "../../hooks/use-button-target"
import type { QuickReplySettingsSectionName } from "./edge"

/**
 * Chooses a section's target. UI only: the canvas edge is kept in step by
 * `QuickReplySettingsEdgeSync`, which stays mounted when this unmounts.
 */
export function NextStepPicker({
  sectionName,
}: {
  sectionName: QuickReplySettingsSectionName
}) {
  const t = useTranslations()
  const [open, setOpen] = useState(false)
  const { setValue, trigger } = useFormContext()
  // `ActiveButton` reads `beforeStep` with getValues, so watching the target
  // here is what re-renders it after a change.
  const target = useWatch({ name: `${sectionName}.target` }) as
    | QuickReplyNextStep
    | null
    | undefined
  const createButtonTarget = useCreateButtonTarget()

  const onChooseButton = useCallback(
    (buttonType: ButtonType | null) => {
      const targetName = `${sectionName}.target`
      if (!buttonType) {
        setValue(targetName, null, { shouldDirty: true, shouldValidate: true })
        return
      }
      const created = createButtonTarget(buttonType)
      if (!created) {
        return
      }
      setValue(
        targetName,
        { buttonType, beforeStep: created.beforeStep },
        { shouldDirty: true },
      )
      // Once `target` has registered child fields, an object `setValue` only
      // validates those leaves, so the node-level "next step required" error
      // on `target` itself would stay. Revalidate it directly.
      trigger(targetName)
      setOpen(false)
    },
    [createButtonTarget, sectionName, setValue, trigger],
  )

  return (
    <>
      {target ? (
        <ActiveButton
          beforeStepName={`${sectionName}.target.beforeStep`}
          buttonType={target.buttonType}
          onChooseButton={onChooseButton}
        />
      ) : (
        <Button
          className="w-full rounded-full"
          onClick={() => setOpen(true)}
          type="button"
          variant="dashed"
        >
          {t("flows.quickReplySettings.chooseNextStep")}
          <ChevronDownIcon />
        </Button>
      )}

      <Dialog onOpenChange={setOpen} open={open}>
        {/*
          Sits beside the centered `sm:max-w-md` QuickReplySettingsDialog
          (half-width 14rem + 1rem gap) instead of on top of it. Below `xl`
          there is no room for both side by side, so it stays centered.
        */}
        <DialogContent
          className="max-w-sm xl:start-[calc(50%+15rem)] xl:ltr:translate-x-0 xl:rtl:translate-x-0"
          overlayProps={{ forceRender: true }}
        >
          <DialogHeader>
            <DialogTitle>
              {t("flows.quickReplySettings.chooseNextStep")}
            </DialogTitle>
            <DialogDescription />
          </DialogHeader>
          <AllButtonOptions
            hiddenButtonTypes={quickReplyNextStepHiddenButtonTypes}
            onChooseButton={onChooseButton}
          />
        </DialogContent>
      </Dialog>
    </>
  )
}
