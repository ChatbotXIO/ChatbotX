import type { SelectOption } from "@aha.chat/ui/components/form/select-field"
import { useTranslations } from "next-intl"
import { type Ref, useEffect, useImperativeHandle, useState } from "react"
import type { PromptVariableListRef } from "./definition"

export type VariableListProps = {
  ref: Ref<PromptVariableListRef>
  items: SelectOption[]
  command: ({ id }: { id: string }) => void
}

export const VariableList = ({
  ref,
  ...props
}: {
  ref: React.Ref<{
    onKeyDown: ({ event }: { event: KeyboardEvent }) => boolean
  }>
  items: SelectOption[]
  command: ({ id }: { id: string }) => void
}) => {
  const t = useTranslations()

  const [selectedIndex, setSelectedIndex] = useState(0)

  const selectItem = (index: number) => {
    const item = props.items[index]

    if (item) {
      props.command({ id: `${item.label}}}` })
    }
  }

  const upHandler = () => {
    setSelectedIndex(
      (selectedIndex + props.items.length - 1) % props.items.length,
    )
  }

  const downHandler = () => {
    setSelectedIndex((selectedIndex + 1) % props.items.length)
  }

  const enterHandler = () => {
    selectItem(selectedIndex)
  }

  useEffect(() => setSelectedIndex(0), [])

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }: { event: KeyboardEvent }) => {
      if (event.key === "ArrowUp") {
        upHandler()
        return true
      }

      if (event.key === "ArrowDown") {
        downHandler()
        return true
      }

      if (event.key === "Enter") {
        enterHandler()
        return true
      }

      return false
    },
  }))

  return (
    <div className="dropdown-menu bg-background!">
      {props.items.length > 0 && (
        <div
          className="flex max-h-60 w-50 flex-col justify-start gap-2 overflow-y-auto"
          onWheel={(e) => {
            e.stopPropagation()
          }}
        >
          {props.items.map((item, index) => (
            <button
              className={`px-2 ${index === selectedIndex ? "is-selected text-gray-100" : "text-gray-600"}`}
              // biome-ignore lint/suspicious/noArrayIndexKey: index is unique
              key={index}
              onClick={() => selectItem(index)}
              type="button"
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
      {props.items.length === 0 && (
        <div className="px-2">{t("messages.noItemsFound")}</div>
      )}
    </div>
  )
}

export default VariableList
