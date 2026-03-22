import { Button } from "@aha.chat/ui/components/ui/button"
import { PlusIcon, XIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { memo, useCallback, useState } from "react"
import { useFieldArray, useFormContext } from "react-hook-form"
import { EditButtonDialog } from "./edit-button-dialog"
import { buttonStepDefaultFn } from "./schema"

type ButtonField = {
  id: string
  text: string
}

const ButtonItem = memo(
  ({
    index,
    parentName,
    onEdit,
    onRemove,
    min,
  }: {
    index: number
    parentName: string
    onEdit: (name: string) => void
    onRemove: (index: number) => void
    min: number
  }) => {
    const { getValues } = useFormContext()
    const buttonText = getValues(`${parentName}.${index}.text`)

    return (
      <div className="relative w-full flex-1">
        <Button
          className="my-1 w-full hover:text-blue-500"
          onClick={() => onEdit(`${parentName}.${index}`)}
          type="button"
          variant="secondary"
        >
          {buttonText}
        </Button>
        {index >= min && (
          <XIcon
            className="absolute top-1/2 right-2 h-4 w-4 -translate-y-1/2 cursor-pointer hover:text-red-500"
            onClick={() => onRemove(index)}
          />
        )}
      </div>
    )
  },
)

type ButtonGroupPreviewComponentProps = {
  parentName: string
  changeType?: boolean
  min?: number
  max?: number
}

const ButtonGroupPreviewComponent = (
  props: ButtonGroupPreviewComponentProps,
) => {
  const { parentName, changeType = true, min = 0, max = 3 } = props
  const t = useTranslations()
  const [openModal, setOpenModal] = useState(false)
  const [openBtnName, setOpenBtnName] = useState("")

  const { control } = useFormContext()
  const { fields, append, remove } = useFieldArray<{
    [key: string]: ButtonField[]
  }>({
    control,
    name: parentName,
  })

  const addButton = useCallback(() => {
    append({
      ...buttonStepDefaultFn(`Button #${fields.length + 1}`),
      id: `button-${fields.length + 1}`,
    })
  }, [append, fields.length])

  const handleEdit = useCallback((name: string) => {
    setOpenBtnName(name)
    setOpenModal(true)
  }, [])

  const handleRemove = useCallback(
    (index: number) => {
      remove(index)
    },
    [remove],
  )

  const handleOpenChange = useCallback((open: boolean) => {
    setOpenModal(open)
  }, [])

  return (
    <div className="flex flex-col gap-3">
      {fields.map((field: ButtonField, index) => (
        <ButtonItem
          index={index}
          key={field.id}
          min={min}
          onEdit={handleEdit}
          onRemove={handleRemove}
          parentName={parentName}
        />
      ))}

      {fields.length < max && (
        <Button
          className="my-1.5 w-full"
          onClick={addButton}
          type="button"
          variant="secondary"
        >
          <PlusIcon />
          {t("actions.createFeature", {
            feature: t("fields.messageTemplate.label"),
          })}
        </Button>
      )}
      {openModal && (
        <EditButtonDialog
          changeType={changeType}
          onOpenChange={handleOpenChange}
          open={openModal}
          parentName={openBtnName}
        />
      )}
    </div>
  )
}

export const ButtonGroupPreview = memo(ButtonGroupPreviewComponent)
