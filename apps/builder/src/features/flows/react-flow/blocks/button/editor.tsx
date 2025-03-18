import { Button } from "@/components/ui/button"
import {
  Sortable,
  SortableDragHandle,
  SortableItem,
} from "@/components/ui/sortable"
import { useTranslate } from "@tolgee/react"
import { MoveIcon, PlusIcon } from "lucide-react"
import { useFieldArray, useFormContext } from "react-hook-form"
import { buttonBlockDefaultFn } from "./schema"
import { EditButtonDialog } from "./components/edit-button-dialog"

export const ButtonBlockEditor = ({
  parentName,
  ...rest
}: {
  parentName: string
}) => {
  const { getValues } = useFormContext()

  const buttonData = getValues(`${parentName}`)

  return (
    <div className="w-full flex-1" {...rest}>
      <EditButtonDialog data={buttonData} />
      {/* <Button
        type="button"
        variant="secondary"
        className="w-full hover:text-blue-500"
      >
        {buttonName}
      </Button> */}
    </div>
  )
}

export const ButtonGroupEditor = ({
  parentName,
  // onEditButton,
}: {
  parentName: string
  // onEditButton: (name: string) => void
}) => {
  const { t } = useTranslate()

  const { control } = useFormContext()
  const { fields, append, move } = useFieldArray({
    control,
    name: parentName,
  })

  function addButton() {
    append(buttonBlockDefaultFn(`Button #${fields.length + 1}`))
  }

  return (
    <>
      <Sortable
        value={fields}
        onMove={({ activeIndex, overIndex }) => move(activeIndex, overIndex)}
        overlay={<div className="h-8 w-full rounded-sm bg-primary/10" />}
      >
        <div className="flex w-full flex-col gap-2">
          {fields.map((field, index) => (
            <SortableItem key={field.id} value={field.id} asChild>
              <div className="w-full flex">
                <ButtonBlockEditor parentName={`${parentName}.${index}`} />
                <SortableDragHandle
                  variant="ghost"
                  size="icon"
                  className="size-8 shrink-0 flex-none hover:bg-transparent"
                >
                  <MoveIcon size={16} />
                </SortableDragHandle>
              </div>
            </SortableItem>
          ))}
        </div>
      </Sortable>

      <Button
        type="button"
        variant="secondary"
        className="w-full my-1.5"
        onClick={addButton}
      >
        <PlusIcon />
        {t("flows.addBtn")}
      </Button>
    </>
  )
}
