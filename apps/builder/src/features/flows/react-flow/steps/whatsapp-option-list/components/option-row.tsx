"use client"

import type { WhatsappOptionListItem } from "@chatbotx.io/flow-config"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { XIcon } from "lucide-react"
import { memo, useCallback } from "react"

type OptionRowProps = {
  index: number
  item: WhatsappOptionListItem
  onEdit: (index: number) => void
  onRemove: (index: number) => void
}

function OptionRowInner({ index, item, onEdit, onRemove }: OptionRowProps) {
  const handleEdit = useCallback(() => onEdit(index), [index, onEdit])
  const handleRemove = useCallback(() => onRemove(index), [index, onRemove])

  return (
    <div className="group relative flex items-center gap-2 rounded-lg bg-background px-3 py-2">
      <button
        className="flex flex-1 flex-col items-start text-left"
        onClick={handleEdit}
        type="button"
      >
        <span className="font-medium text-sm">{item.title}</span>
        {item.description ? (
          <span className="text-muted-foreground text-xs">
            {item.description}
          </span>
        ) : null}
      </button>
      <Button
        className="opacity-0 transition-opacity group-hover:opacity-100"
        onClick={handleRemove}
        size="icon"
        type="button"
        variant="ghost"
      >
        <XIcon className="size-4" />
      </Button>
    </div>
  )
}

export const OptionRow = memo(OptionRowInner)
