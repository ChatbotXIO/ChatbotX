import { Button } from "@/components/ui/button"
import { useTranslate } from "@tolgee/react"
import { PlusIcon, XIcon } from "lucide-react"
import { useFieldArray, useFormContext } from "react-hook-form"
import { buttonBlockDefaultValue } from "./schema"
import { useState, useCallback, memo } from "react"
import { EditButtonDialog } from "./edit-button-dialog"

interface ButtonField {
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
      <div className="w-full flex-1 relative">
        <Button
          type="button"
          variant="secondary"
          className="w-full hover:text-blue-500 my-1"
          onClick={() => onEdit(`${parentName}.${index}`)}
        >
          {buttonText}
        </Button>
        {index >= min && (
          <XIcon
            className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 cursor-pointer hover:text-red-500"
            onClick={() => onRemove(index)}
          />
        )}
      </div>
    )
  },
)

const ButtonGroupPreviewComponent = ({
  parentName,
  changeType = true,
  min = 0,
  max = 3,
}: {
  parentName: string
  changeType?: boolean
  min?: number
  max?: number
}) => {
  const { t } = useTranslate()
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
      ...buttonBlockDefaultValue(`Button #${fields.length + 1}`),
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
          key={field.id}
          index={index}
          parentName={parentName}
          onEdit={handleEdit}
          onRemove={handleRemove}
          min={min}
        />
      ))}

      {fields.length < max && (
        <Button
          type="button"
          variant="secondary"
          className="w-full my-1.5"
          onClick={addButton}
        >
          <PlusIcon />
          {t("flows.addBtn")}
        </Button>
      )}
      {openModal && (
        <EditButtonDialog
          parentName={openBtnName}
          open={openModal}
          onOpenChange={handleOpenChange}
          changeType={changeType}
        />
      )}
    </div>
  )
}

export const ButtonGroupPreview = memo(ButtonGroupPreviewComponent)
