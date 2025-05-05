import { Button } from "@/components/ui/button"
import {
  Sortable,
  SortableItemHandle,
  SortableItem,
} from "@/components/ui/sortable"
import { T } from "@tolgee/react"
import { GripVerticalIcon, PlusIcon } from "lucide-react"
import { useFieldArray, useFormContext } from "react-hook-form"
import { useStepStore } from "../../stores/step-store-provider"
import { buttonStepDefaultFn } from "./schema"

export const ButtonStepEditor = ({
  parentName,
  ...rest
}: {
  parentName: string
}) => {
  const { getValues } = useFormContext()
  const { setButtonPath } = useStepStore((state) => state)

  const buttonData = getValues(`${parentName}`)

  return (
    <div className="w-full flex-1" {...rest}>
      <Button
        type="button"
        variant="secondary"
        className="w-full hover:text-blue-500"
        onClick={() => {
          setButtonPath(`data.${parentName}`.replace(/\.(\d+)/g, "[$1]"))
        }}
      >
        {buttonData.label}
      </Button>
    </div>
  )
}

export const ButtonGroupEditor = ({ parentName }: { parentName: string }) => {
  const { control } = useFormContext()
  const { fields, append, move } = useFieldArray({
    control,
    name: parentName,
  })

  function addButton() {
    append(buttonStepDefaultFn(`Button #${fields.length + 1}`))
  }

  return (
    <>
      <Sortable
        value={fields}
        onMove={({ activeIndex, overIndex }) => move(activeIndex, overIndex)}
        getItemValue={(item) => item.id}
      >
        <div className="flex w-full flex-col gap-2">
          {fields.map((field, index) => (
            <SortableItem key={field.id} value={field.id} asChild>
              <div className="w-full flex items-center gap-1">
                <ButtonStepEditor parentName={`${parentName}.${index}`} />
                <SortableItemHandle asChild>
                  <Button variant="ghost" size="icon" className="size-8">
                    <GripVerticalIcon className="h-4 w-4" />
                  </Button>
                </SortableItemHandle>
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
        <T keyName="flows.addBtn" />
      </Button>
    </>
  )
}
