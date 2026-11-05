"use client"

import { Badge } from "@chatbotx.io/ui/components/ui/badge"
import { Checkbox } from "@chatbotx.io/ui/components/ui/checkbox"
import { Label } from "@chatbotx.io/ui/components/ui/label"
import { LockIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useOptionalLabel } from "../lib/use-optional-label"

export type ResourceItem = {
  id: string
  name: string
  folderName?: string
  badge?: string
  /** A View-only template copy: a new template may not include it. */
  locked?: boolean
}

type ResourceRowProps = {
  idPrefix: string
  item: ResourceItem
  isChecked: boolean
  isViewOnly: boolean
  onCheckedChange: (checked: boolean) => void
  onViewOnlyChange: (viewOnly: boolean) => void
}

export function ResourceRow({
  idPrefix,
  item,
  isChecked,
  isViewOnly,
  onCheckedChange,
  onViewOnlyChange,
}: ResourceRowProps) {
  const t = useTranslations()
  const channelLabel = useOptionalLabel("templates.channels")
  const rowId = `${idPrefix}-${item.id}`

  return (
    <div className="flex items-center gap-2 border-b px-3 py-2 text-sm last:border-b-0 hover:bg-muted/50">
      <Checkbox
        checked={isChecked}
        // Still uncheckable when it was picked before it was locked.
        disabled={item.locked && !isChecked}
        id={rowId}
        onCheckedChange={(checked) => onCheckedChange(Boolean(checked))}
      />
      <Label
        className="flex-1 cursor-pointer truncate font-normal"
        htmlFor={rowId}
      >
        {item.name}
      </Label>
      {item.locked ? (
        <Badge
          className="flex-none"
          title={t("templates.form.viewOnlyCopyIncluded")}
          variant="outline"
        >
          <LockIcon />
          {t("templates.installs.viewOnly")}
        </Badge>
      ) : null}
      {item.badge ? (
        <Badge className="flex-none" variant="outline">
          {channelLabel(item.badge)}
        </Badge>
      ) : null}
      {item.folderName ? (
        <span className="ml-auto truncate text-muted-foreground text-xs">
          {item.folderName}
        </span>
      ) : null}
      {isChecked ? (
        <span className="ml-auto flex items-center gap-1.5">
          <Checkbox
            checked={isViewOnly}
            id={`${rowId}-lock`}
            onCheckedChange={(checked) => onViewOnlyChange(Boolean(checked))}
          />
          <Label
            className="cursor-pointer font-normal text-muted-foreground text-xs"
            htmlFor={`${rowId}-lock`}
          >
            {t("templates.form.viewOnly")}
          </Label>
        </span>
      ) : null}
    </div>
  )
}
