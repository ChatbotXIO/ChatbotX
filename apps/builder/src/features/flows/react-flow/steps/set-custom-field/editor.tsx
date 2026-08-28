"use client"

import {
  type SetCustomFieldStepSchema,
  setCustomFieldStepSchema,
} from "@chatbotx.io/flow-config"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Calendar } from "@chatbotx.io/ui/components/ui/calendar"
import { TimePicker } from "@chatbotx.io/ui/components/ui/date-picker"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@chatbotx.io/ui/components/ui/dialog"
import { Form } from "@chatbotx.io/ui/components/ui/form"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@chatbotx.io/ui/components/ui/popover"
import { zodResolver } from "@hookform/resolvers/zod"
import { format, parse } from "date-fns"
import { useTranslations } from "next-intl"
import { useMemo, useRef, useState } from "react"
import { useForm, useFormContext } from "react-hook-form"
import { PlainTextEditorField } from "@/components/tiptap/plain-text-editor-field"
import { getBrowserTimezone } from "@/features/contact-filter/lib/timezone"
import {
  CustomFieldOperationSelect,
  CustomFieldSelect,
} from "@/features/custom-fields/custom-field-select"
import { findFieldByReference } from "@/features/custom-fields/lib/find-field-by-reference"
import { useCustomFieldStore } from "@/features/custom-fields/provider/custom-field-store-context"
import { useParentStepCommit } from "../base/use-parent-step-commit"

const SetCustomFieldStepEditor = ({ parentName }: { parentName: string }) => {
  const t = useTranslations()
  const { getValues } = useFormContext()
  const commitStep = useParentStepCommit<SetCustomFieldStepSchema>(parentName)
  const defaultValues: SetCustomFieldStepSchema = getValues(parentName)

  const [open, setOpen] = useState<boolean>(false)

  const customFieldForm = useForm<SetCustomFieldStepSchema>({
    resolver: zodResolver(setCustomFieldStepSchema),
    defaultValues,
  })

  // The selected field's type drives the temporal hint. `inputFieldId` is
  // either a customField id/name (legacy lookup) or a `bot_field:<id>` token.
  const { customFields, botFields } = useCustomFieldStore((state) => state)
  const selectedFieldId = customFieldForm.watch("inputFieldId")
  const selectedFieldType = findFieldByReference(selectedFieldId, {
    customFields,
    botFields,
  })?.type
  const isTemporalField =
    selectedFieldType === "date" || selectedFieldType === "datetime"
  const isBooleanField = selectedFieldType === "boolean"
  const isPickableField = isTemporalField || isBooleanField

  // Temporal and boolean fields get a second input mode: clicking the value's
  // text area opens a picker (calendar + time, or true/false) that writes the
  // picked value back into the same free-text value, so typing and
  // {{variable}} tokens keep working alongside the picker.
  const [isPickerOpen, setIsPickerOpen] = useState(false)
  // Bumped after a pick to remount the tiptap field — it only reads the form
  // value on mount, so a plain setValue would leave the visible text stale.
  const [valueEditorKey, setValueEditorKey] = useState(0)
  const isClickInTextAreaRef = useRef(false)

  const pickerFormat =
    selectedFieldType === "date" ? "yyyy-MM-dd" : "yyyy-MM-dd HH:mm:ss"
  const watchedValue = customFieldForm.watch("value")
  const pickedDate = useMemo(() => {
    if (!(isTemporalField && watchedValue)) {
      return
    }
    const parsed = parse(watchedValue.trim(), pickerFormat, new Date())
    return Number.isNaN(parsed.getTime()) ? undefined : parsed
  }, [isTemporalField, watchedValue, pickerFormat])
  const timePickerBase = useMemo(
    () => pickedDate ?? new Date(new Date().setHours(0, 0, 0, 0)),
    [pickedDate],
  )

  const applyPickedValue = (
    picked: string,
    options?: { keepOpen?: boolean },
  ) => {
    customFieldForm.setValue("value", picked, {
      shouldDirty: true,
      shouldValidate: true,
    })
    setValueEditorKey((current) => current + 1)
    if (!options?.keepOpen) {
      setIsPickerOpen(false)
    }
  }

  const applyPickedDate = (picked: Date | undefined) => {
    if (!picked) {
      return
    }
    // Datetime keeps the popover open so the time can still be adjusted.
    applyPickedValue(format(picked, pickerFormat), {
      keepOpen: selectedFieldType === "datetime",
    })
  }

  function onSubmit(values: SetCustomFieldStepSchema) {
    commitStep({
      inputFieldId: values.inputFieldId,
      operation: values.operation,
      value: values.value,
      // Freeze the editor's browser zone so the worker (no browser context) can
      // anchor a naive date/datetime value and render "now" for a blank one.
      timezone: getBrowserTimezone(),
    })

    setOpen(false)
  }

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger
        nativeButton={false}
        render={
          <div className="rounded-lg border-2 border-dashed p-4 text-sm">
            {t("flows.actions.setCustomField")}
          </div>
        }
      />
      <DialogContent className={"max-h-screen max-w-lg overflow-y-scroll"}>
        <DialogHeader>
          <DialogTitle>{t("flows.actions.setCustomField")}</DialogTitle>
          <DialogDescription />
        </DialogHeader>
        <Form {...customFieldForm}>
          <form
            className="flex flex-col gap-6"
            onSubmit={customFieldForm.handleSubmit(onSubmit)}
          >
            <CustomFieldSelect
              allowCreate={true}
              includeBotFields
              label={t("fields.customField.label")}
              name="inputFieldId"
              required
            />
            <CustomFieldOperationSelect
              name="operation"
              required
              type={selectedFieldType ?? null}
            />
            <div className="flex flex-col gap-1.5">
              {isPickableField ? (
                <Popover
                  onOpenChange={(open) => {
                    // Only clicks in the text area open the picker — clicks on
                    // the inline {{variable}} icon keep their own popover.
                    if (open && !isClickInTextAreaRef.current) {
                      return
                    }
                    setIsPickerOpen(open)
                  }}
                  open={isPickerOpen}
                >
                  <PopoverTrigger
                    nativeButton={false}
                    render={
                      <div
                        onClickCapture={(event) => {
                          isClickInTextAreaRef.current = Boolean(
                            (event.target as HTMLElement).closest(
                              ".tiptap-plain-text",
                            ),
                          )
                        }}
                      >
                        <PlainTextEditorField
                          includeRawCustomFieldVariables
                          inline
                          key={valueEditorKey}
                          label={t("fields.value.label")}
                          name="value"
                          showEmojiPicker={false}
                        />
                      </div>
                    }
                  />
                  <PopoverContent align="start" className="w-auto p-0">
                    {isBooleanField ? (
                      <div className="flex flex-col p-1">
                        <Button
                          className="justify-start"
                          onClick={() => applyPickedValue("true")}
                          type="button"
                          variant="ghost"
                        >
                          {t("fields.boolean.true")}
                        </Button>
                        <Button
                          className="justify-start"
                          onClick={() => applyPickedValue("false")}
                          type="button"
                          variant="ghost"
                        >
                          {t("fields.boolean.false")}
                        </Button>
                      </div>
                    ) : (
                      <>
                        <Calendar
                          defaultMonth={pickedDate}
                          mode="single"
                          onSelect={(day) => {
                            if (!day) {
                              return
                            }
                            day.setHours(
                              pickedDate?.getHours() ?? 0,
                              pickedDate?.getMinutes() ?? 0,
                              pickedDate?.getSeconds() ?? 0,
                            )
                            applyPickedDate(day)
                          }}
                          selected={pickedDate}
                        />
                        {selectedFieldType === "datetime" ? (
                          <div className="border-border border-t p-3">
                            <TimePicker
                              date={timePickerBase}
                              granularity="second"
                              hourCycle={24}
                              onChange={applyPickedDate}
                            />
                          </div>
                        ) : null}
                      </>
                    )}
                  </PopoverContent>
                </Popover>
              ) : (
                <PlainTextEditorField
                  includeRawCustomFieldVariables
                  inline
                  label={t("fields.value.label")}
                  name="value"
                  showEmojiPicker={false}
                />
              )}
              {isTemporalField ? (
                <p className="text-muted-foreground text-xs">
                  {t("flows.setCustomField.temporalHint")}
                </p>
              ) : null}
            </div>

            <div className="flex w-full items-center justify-end gap-2">
              <Button
                onClick={() => setOpen(false)}
                size={"sm"}
                type="button"
                variant={"link"}
              >
                {t("actions.cancel")}
              </Button>
              <Button
                disabled={
                  !customFieldForm.formState.isValid ||
                  customFieldForm.formState.isSubmitting
                }
                size={"sm"}
                type="submit"
              >
                {t("actions.save")}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}

export default SetCustomFieldStepEditor
