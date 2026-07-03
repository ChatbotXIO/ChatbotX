import { buttonStepDefaultFn } from "@chatbotx.io/flow-config"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Sortable,
  SortableItem,
  SortableItemHandle,
} from "@chatbotx.io/ui/components/ui/sortable"
import { GripVerticalIcon, PlusIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useFieldArray, useFormContext } from "react-hook-form"
import type { ButtonEditorConfig } from "../../stores/step-store"
import { useStepStore } from "../../stores/step-store-provider"

const MAX_BUTTON_GROUP_BUTTONS = 3

type ButtonStepEditorProps = {
  parentName: string
  editorConfig?: ButtonEditorConfig
}

export const ButtonStepEditor = (props: ButtonStepEditorProps) => {
  const { parentName, editorConfig, ...rest } = props

  const { getValues } = useFormContext()
  const { setButtonPath, setOpenButtonEditorDialog, setButtonEditorConfig } =
    useStepStore((state) => state)

  const buttonData = getValues(`${parentName}`)

  return (
    <div className="w-full flex-1" {...rest}>
      <Button
        className="w-full hover:text-blue-500"
        onClick={() => {
          setButtonEditorConfig(editorConfig ?? null)
          setButtonPath(`data.details.${parentName}`)
          setOpenButtonEditorDialog(true)
        }}
        type="button"
        variant="secondary"
      >
        {buttonData.label}
      </Button>
    </div>
  )
}

type ButtonGroupEditorProps = {
  parentName: string
}

export const ButtonGroupEditor = (props: ButtonGroupEditorProps) => {
  const { parentName } = props
  const t = useTranslations()
  const { control } = useFormContext()
  const { fields, append, move } = useFieldArray({
    control,
    name: parentName,
  })

  function addButton() {
    append(
      buttonStepDefaultFn({
        label: `${t("fields.button.label")} #${fields.length + 1}`,
      }),
    )
  }

  return (
    <>
      <Sortable
        getItemValue={(item) => item.id}
        onMove={({ activeIndex, overIndex }) => move(activeIndex, overIndex)}
        value={fields}
      >
        <div className="flex w-full flex-col gap-2">
          {fields.map((field, index) => (
            <SortableItem asChild key={field.id} value={field.id}>
              <div className="flex w-full items-center gap-1">
                <ButtonStepEditor parentName={`${parentName}.${index}`} />
                <SortableItemHandle asChild>
                  <Button className="size-8" size="icon" variant="ghost">
                    <GripVerticalIcon className="h-4 w-4" />
                  </Button>
                </SortableItemHandle>
              </div>
            </SortableItem>
          ))}
        </div>
      </Sortable>

      <Button
        className="my-1.5 w-full"
        disabled={fields.length >= MAX_BUTTON_GROUP_BUTTONS}
        onClick={addButton}
        type="button"
        variant="secondary"
      >
        <PlusIcon />
        {t("actions.add")}
      </Button>
      {fields.length >= MAX_BUTTON_GROUP_BUTTONS ? (
        <p className="text-muted-foreground text-sm">
          {t("flows.buttons.limitReached", { max: MAX_BUTTON_GROUP_BUTTONS })}
        </p>
      ) : null}
    </>
  )
}
