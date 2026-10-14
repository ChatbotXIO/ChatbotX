"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import { PlusIcon } from "lucide-react"
import type { ReactNode } from "react"
import { moveItem, patchItem, removeItem } from "../../lib/list-editing"
import { ItemControls } from "./item-controls"

type ItemRenderer<T> = (
  item: T,
  patch: (change: Partial<T>) => void,
) => ReactNode

/**
 * A list of cards, one per item: a title with move/remove buttons, then a
 * two-column grid of fields, then any extra field; an add button closes it.
 */
export function RepeatableList<T extends object>({
  items,
  onChange,
  title,
  fields,
  extra,
  createItem,
  addLabel,
}: {
  items: T[]
  onChange: (next: T[]) => void
  title: ItemRenderer<T>
  fields: ItemRenderer<T>
  extra?: ItemRenderer<T>
  createItem: () => T
  addLabel: string
}) {
  return (
    <div className="flex flex-col gap-2">
      {items.map((item, index) => {
        const patch = (change: Partial<T>) =>
          onChange(patchItem(items, index, change))
        return (
          <div
            className="flex flex-col gap-1.5 rounded-md border p-2"
            // biome-ignore lint/suspicious/noArrayIndexKey: ids are editable; keying by them would remount the row on every keystroke
            key={index}
          >
            <div className="flex items-center gap-1">
              {title(item, patch)}
              <ItemControls
                count={items.length}
                index={index}
                onMove={(to) => onChange(moveItem(items, index, to))}
                onRemove={() => onChange(removeItem(items, index))}
              />
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {fields(item, patch)}
            </div>
            {extra?.(item, patch)}
          </div>
        )
      })}
      <Button
        onClick={() => onChange([...items, createItem()])}
        size="sm"
        type="button"
        variant="outline"
      >
        <PlusIcon className="size-4" />
        {addLabel}
      </Button>
    </div>
  )
}
