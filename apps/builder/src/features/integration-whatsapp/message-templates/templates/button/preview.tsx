import { Button } from "@/components/ui/button"
import { useTranslate } from "@tolgee/react"
import { PlusIcon, XIcon } from "lucide-react"
import { useFieldArray, useFormContext } from "react-hook-form"
import { buttonBlockDefaultValue } from "./schema"
import { useState } from "react"
import { EditButtonDialog } from "./edit-button-dialog"

export const ButtonGroupEditor = ({
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

  const { control, getValues } = useFormContext()
  const { fields, append, remove } = useFieldArray({
    control,
    name: parentName,
  })

  function addButton() {
    append(buttonBlockDefaultValue(`Button #${fields.length + 1}`))
  }

  return (
    <div className="flex flex-col gap-3">
      {fields.map((field, index) => (
        <div key={field.id} className="w-full flex-1 relative">
          <Button
            type="button"
            variant="secondary"
            className="w-full hover:text-blue-500 my-1"
            onClick={() => {
              setOpenBtnName(`${parentName}.${index}`)
              setOpenModal(true)
            }}
          >
            {getValues(`${parentName}.${index}.text`)}
          </Button>
          {fields.length > min && (
            <XIcon
              className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 cursor-pointer hover:text-red-500"
              onClick={() => remove(index)}
            />
          )}
        </div>
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
          onOpenChange={(open) => setOpenModal(open)}
          changeType={changeType}
        />
      )}
    </div>
  )
}
