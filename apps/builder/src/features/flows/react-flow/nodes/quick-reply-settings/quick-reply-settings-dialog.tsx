"use client"

import {
  QUICK_REPLY_DEFAULT_RETRIES,
  QUICK_REPLY_MAX_RETRIES,
  QUICK_REPLY_RETRY_MESSAGE_MAX,
  type QuickReplySettingsDelayUnit,
  quickReplySettingsDefaultFn,
  quickReplySettingsDelayUnits,
} from "@chatbotx.io/flow-config"
import { InputNumberField } from "@chatbotx.io/ui/components/form/input-number-field"
import { SelectField } from "@chatbotx.io/ui/components/form/select-field"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@chatbotx.io/ui/components/ui/dialog"
import { Label } from "@chatbotx.io/ui/components/ui/label"
import { SettingsIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useEffect, useMemo, useState } from "react"
import { useFormContext, useWatch } from "react-hook-form"
import { TiptapEditorField } from "@/components/tiptap/tiptap-editor-field"
import { NextStepPicker } from "./next-step-picker"
import { useHasGetUserDataStep } from "./quick-reply-settings-edge-sync"
import { Divider, SectionErrors, SectionSwitch } from "./section-controls"

const FOLLOW_UP = "quickReplySettings.followUp"
const RETRY = "quickReplySettings.retry"

const delayUnitLabelKeys = {
  minutes: "fields.delayUnit.minutes",
  hours: "fields.delayUnit.hours",
  days: "fields.delayUnit.days",
} as const satisfies Record<QuickReplySettingsDelayUnit, string>

/**
 * The ⚙️ entry point and the live settings dialog for a node's quick replies.
 * Rendered only while the node has at least one quick reply. The canvas
 * edges are kept in step by `QuickReplySettingsEdgeSyncs`, which the node
 * editor mounts next to this, outside the dialog.
 */
export function QuickReplySettingsDialog() {
  const t = useTranslations()
  const [open, setOpen] = useState(false)
  const { getValues, setValue, trigger } = useFormContext()

  const settings = useWatch({ name: "quickReplySettings" })
  const followUpEnabled = useWatch({ name: `${FOLLOW_UP}.enabled` }) as
    | boolean
    | undefined
  const retryEnabled = useWatch({ name: `${RETRY}.enabled` }) as
    | boolean
    | undefined
  const maxRetries = useWatch({ name: `${RETRY}.maxRetries` })
  const hasGetUserData = useHasGetUserDataStep()

  // Nodes saved before this feature have no settings: backfill on first open.
  useEffect(() => {
    if (open && !getValues("quickReplySettings")) {
      setValue("quickReplySettings", quickReplySettingsDefaultFn(), {
        shouldDirty: true,
      })
    }
  }, [getValues, open, setValue])

  const unitOptions = useMemo(
    () =>
      quickReplySettingsDelayUnits.options.map((unit) => ({
        value: unit,
        label: t(delayUnitLabelKeys[unit]),
      })),
    [t],
  )
  const retryOptions = useMemo(
    () =>
      Array.from({ length: QUICK_REPLY_MAX_RETRIES + 1 }, (_, count) => ({
        value: String(count),
        label: t("flows.quickReplySettings.retry.countOption", { count }),
      })),
    [t],
  )

  // The toggle and retry count feed node-level rules on sibling fields, which
  // a single-field validation would not refresh.
  const revalidate = (section: typeof FOLLOW_UP | typeof RETRY) => {
    queueMicrotask(() => {
      trigger(section)
    })
  }

  // Filled here, not in an effect: the retry editor reads its value once
  // when it mounts, which happens right after this switch turns on.
  const onRetryToggle = (checked: boolean) => {
    if (checked && !getValues(`${RETRY}.message`)) {
      setValue(
        `${RETRY}.message`,
        t("flows.quickReplySettings.retry.messageDefault"),
        { shouldDirty: true },
      )
    }
    revalidate(RETRY)
  }

  return (
    <>
      <Button
        aria-label={t("flows.quickReplySettings.open")}
        onClick={() => setOpen(true)}
        size="icon"
        title={t("flows.quickReplySettings.open")}
        type="button"
        variant="ghost"
      >
        <SettingsIcon />
      </Button>

      <Dialog onOpenChange={setOpen} open={open}>
        <DialogContent className="max-h-screen overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("flows.quickReplySettings.title")}</DialogTitle>
            <DialogDescription />
          </DialogHeader>

          {settings && (
            <div className="flex flex-col gap-4">
              <section className="flex flex-col gap-3">
                <SectionSwitch
                  label={t("flows.quickReplySettings.followUp.label")}
                  onToggle={() => revalidate(FOLLOW_UP)}
                  sectionName={FOLLOW_UP}
                />
                {followUpEnabled && (
                  <>
                    <div className="flex items-start gap-2">
                      <Label className="mt-2 flex-1">
                        {t("flows.quickReplySettings.followUp.waitFor")}
                      </Label>
                      <InputNumberField
                        formItemClassName="w-30"
                        min={1}
                        name={`${FOLLOW_UP}.duration`}
                        required
                        stepper={1}
                      />
                      <SelectField
                        formItemClassName="w-30"
                        name={`${FOLLOW_UP}.unit`}
                        options={unitOptions}
                        required
                      />
                    </div>
                    <p className="text-muted-foreground text-xs">
                      {t("flows.quickReplySettings.followUp.windowHint")}
                    </p>
                    <Divider>
                      {t("flows.quickReplySettings.followUp.divider")}
                    </Divider>
                    <NextStepPicker sectionName={FOLLOW_UP} />
                  </>
                )}
                <SectionErrors fields={["target"]} sectionName={FOLLOW_UP} />
              </section>

              <div className="h-px bg-border" />

              <section className="flex flex-col gap-3">
                <SectionSwitch
                  description={
                    hasGetUserData
                      ? t("flows.quickReplySettings.retry.getUserDataConflict")
                      : undefined
                  }
                  // An enabled Retry stays switchable so its error can be fixed.
                  disabled={hasGetUserData && !retryEnabled}
                  label={t("flows.quickReplySettings.retry.label")}
                  onToggle={onRetryToggle}
                  sectionName={RETRY}
                />
                {retryEnabled && !hasGetUserData && (
                  <>
                    {Number(maxRetries) > 0 && (
                      <TiptapEditorField
                        hideMessage
                        includeBotFieldVariables
                        label={t("flows.quickReplySettings.retry.message")}
                        maxLength={QUICK_REPLY_RETRY_MESSAGE_MAX}
                        name={`${RETRY}.message`}
                        required
                      />
                    )}
                    <SelectField
                      label={t("flows.quickReplySettings.retry.count")}
                      name={`${RETRY}.maxRetries`}
                      onValueChange={(value) => {
                        setValue(`${RETRY}.maxRetries`, Number(value), {
                          shouldDirty: true,
                          shouldValidate: true,
                        })
                        revalidate(RETRY)
                      }}
                      options={retryOptions}
                      required
                      value={String(maxRetries ?? QUICK_REPLY_DEFAULT_RETRIES)}
                    />
                    <Divider>
                      {t("flows.quickReplySettings.retry.divider")}
                    </Divider>
                    <NextStepPicker sectionName={RETRY} />
                  </>
                )}
                <SectionErrors
                  fields={["enabled", "message", "target"]}
                  sectionName={RETRY}
                />
              </section>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
