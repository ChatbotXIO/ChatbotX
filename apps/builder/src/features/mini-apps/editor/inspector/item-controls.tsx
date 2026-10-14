"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import { ArrowDownIcon, ArrowUpIcon, Trash2Icon } from "lucide-react"
import { useTranslations } from "next-intl"

/** Move up, move down and remove buttons for one item of a list. */
export function ItemControls({
  index,
  count,
  onMove,
  onRemove,
  minItems = 1,
}: {
  index: number
  count: number
  onMove: (to: number) => void
  onRemove: () => void
  minItems?: number
}) {
  const t = useTranslations("miniApps.inspector")
  return (
    <div className="flex items-center">
      <Button
        aria-label={t("moveUp")}
        disabled={index === 0}
        onClick={() => onMove(index - 1)}
        size="icon"
        type="button"
        variant="ghost"
      >
        <ArrowUpIcon className="size-3.5" />
      </Button>
      <Button
        aria-label={t("moveDown")}
        disabled={index === count - 1}
        onClick={() => onMove(index + 1)}
        size="icon"
        type="button"
        variant="ghost"
      >
        <ArrowDownIcon className="size-3.5" />
      </Button>
      <Button
        aria-label={t("removeItem")}
        disabled={count <= minItems}
        onClick={onRemove}
        size="icon"
        type="button"
        variant="ghost"
      >
        <Trash2Icon className="size-3.5" />
      </Button>
    </div>
  )
}
