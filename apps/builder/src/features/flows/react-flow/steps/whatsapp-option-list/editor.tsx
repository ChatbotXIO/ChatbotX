"use client"

import {
  WHATSAPP_OPTION_LIST_MAX_OPTIONS,
  type WhatsappOptionListButtonLabelFormValues,
  type WhatsappOptionListItem,
  type WhatsappOptionListOptionFormValues,
  whatsappOptionListItemDefaultFn,
} from "@chatbotx.io/flow-config"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Pencil, PlusIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useCallback, useState } from "react"
import { useFieldArray, useFormContext, useWatch } from "react-hook-form"
import { TiptapEditorField } from "@/components/tiptap/tiptap-editor-field"
import { ButtonLabelDialog } from "./components/button-label-dialog"
import { OptionDialog } from "./components/option-dialog"
import { OptionRow } from "./components/option-row"

type WhatsappOptionListStepEditorProps = {
  parentName: string
}

const WhatsappOptionListStepEditor = ({
  parentName,
}: WhatsappOptionListStepEditorProps) => {
  const t = useTranslations()
  const { control, setValue, getValues } = useFormContext()
  const buttonLabel = useWatch({
    control,
    name: `${parentName}.buttonLabel`,
  }) as string

  const {
    fields: rawFields,
    append,
    remove,
    update,
  } = useFieldArray({
    control,
    name: `${parentName}.options`,
    keyName: "_key",
  })
  const fields = rawFields as Array<WhatsappOptionListItem & { _key: string }>

  const [buttonDialogOpen, setButtonDialogOpen] = useState(false)
  const [activeOptionIndex, setActiveOptionIndex] = useState<number | null>(
    null,
  )

  const handleAddOption = useCallback(() => {
    const currentOptions =
      (getValues(`${parentName}.options`) as WhatsappOptionListItem[]) ?? []

    if (currentOptions.length >= WHATSAPP_OPTION_LIST_MAX_OPTIONS) {
      return
    }

    append(
      whatsappOptionListItemDefaultFn({
        title: `Title #${currentOptions.length + 1}`,
      }),
    )
  }, [append, getValues, parentName])

  const handleRemoveOption = useCallback(
    (index: number) => {
      remove(index)
    },
    [remove],
  )

  const handleEditOption = useCallback((index: number) => {
    setActiveOptionIndex(index)
  }, [])

  const handleSaveOption = useCallback(
    (index: number, values: WhatsappOptionListOptionFormValues) => {
      const current = getValues(
        `${parentName}.options.${index}`,
      ) as WhatsappOptionListItem

      update(index, {
        ...current,
        title: values.title,
        description: values.description ? values.description : undefined,
      })
    },
    [getValues, parentName, update],
  )

  const handleSaveButtonLabel = useCallback(
    (values: WhatsappOptionListButtonLabelFormValues) => {
      setValue(`${parentName}.buttonLabel`, values.buttonLabel, {
        shouldDirty: true,
        shouldValidate: true,
      })
    },
    [parentName, setValue],
  )

  const handleOptionDialogOpenChange = useCallback((open: boolean) => {
    if (!open) {
      setActiveOptionIndex(null)
    }
  }, [])

  const handleOpenButtonDialog = useCallback(() => {
    setButtonDialogOpen(true)
  }, [])

  const canAdd = fields.length < WHATSAPP_OPTION_LIST_MAX_OPTIONS

  return (
    <div className="items-center justify-center overflow-hidden rounded-lg">
      <div className="bg-secondary px-4 py-2">
        <TiptapEditorField name={`${parentName}.text`} />
      </div>

      <div className="bg-slate-200 px-3 py-2 dark:bg-neutral-900">
        <Button
          className="w-full justify-between"
          onClick={handleOpenButtonDialog}
          type="button"
          variant="outline"
        >
          <span className="truncate">{buttonLabel}</span>
          <Pencil className="size-4" />
        </Button>
      </div>

      <div className="bg-slate-200 px-3 pb-2 dark:bg-neutral-900">
        <div className="p-4 px-1 text-center text-muted-foreground text-xs">
          {buttonLabel}
        </div>
        <div className="flex flex-col gap-2">
          {fields.map((field, index) => (
            <OptionRow
              index={index}
              item={field}
              key={field._key}
              onEdit={handleEditOption}
              onRemove={handleRemoveOption}
            />
          ))}
        </div>

        {canAdd && (
          <Button
            className="mt-3 w-full"
            onClick={handleAddOption}
            type="button"
            variant="dashed"
          >
            <PlusIcon className="mr-1 size-4" />
            {t("flows.whatsappOptionList.addOption")}
          </Button>
        )}
      </div>

      <ButtonLabelDialog
        currentLabel={buttonLabel ?? ""}
        onOpenChange={setButtonDialogOpen}
        onSave={handleSaveButtonLabel}
        open={buttonDialogOpen}
      />
      {activeOptionIndex === null ? null : (
        <OptionDialog
          currentItem={fields[activeOptionIndex]}
          index={activeOptionIndex}
          onOpenChange={handleOptionDialogOpenChange}
          onSave={handleSaveOption}
          open={activeOptionIndex !== null}
        />
      )}
    </div>
  )
}

export default WhatsappOptionListStepEditor
