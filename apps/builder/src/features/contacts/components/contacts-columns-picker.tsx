"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Checkbox } from "@chatbotx.io/ui/components/ui/checkbox"
import { Label } from "@chatbotx.io/ui/components/ui/label"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@chatbotx.io/ui/components/ui/popover"
import { Separator } from "@chatbotx.io/ui/components/ui/separator"
import type { Table } from "@tanstack/react-table"
import { Columns3Icon } from "lucide-react"
import { useTranslations } from "next-intl"
import type { ListContactsItem } from "@/features/contacts/schemas/query"

type ContactsColumnsPickerProps = {
  table: Table<ListContactsItem>
}

// Picker de visibilidade de colunas pra tabela /contacts (#20.3).
// Colunas com enableHiding: false (select, keyword/nome, createdAt) não
// aparecem aqui. Persistência em localStorage é feita pelo pai (contacts-table)
// via useEffect — este componente só dispara toggleVisibility do TanStack.
export function ContactsColumnsPicker({ table }: ContactsColumnsPickerProps) {
  const t = useTranslations()
  const hideableColumns = table
    .getAllLeafColumns()
    .filter((col) => col.getCanHide())

  if (hideableColumns.length === 0) {
    return null
  }

  const allVisible = hideableColumns.every((col) => col.getIsVisible())
  const noneVisible = hideableColumns.every((col) => !col.getIsVisible())

  const toggleAll = (visible: boolean) => {
    for (const col of hideableColumns) {
      col.toggleVisibility(visible)
    }
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline">
          <Columns3Icon className="size-4" />
          {t("contacts.columnsPicker.button")}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-60 p-2">
        <div className="flex items-center justify-between gap-2 px-2 py-1.5">
          <span className="font-medium text-xs">
            {t("contacts.columnsPicker.title")}
          </span>
          <button
            className="text-muted-foreground text-xs hover:text-foreground"
            onClick={() => toggleAll(!allVisible || noneVisible)}
            type="button"
          >
            {allVisible
              ? t("contacts.columnsPicker.hideAll")
              : t("contacts.columnsPicker.showAll")}
          </button>
        </div>
        <Separator className="my-1" />
        <div className="flex flex-col gap-1">
          {hideableColumns.map((col) => {
            const label =
              (col.columnDef.meta as { label?: string } | undefined)?.label ??
              col.id
            return (
              <Label
                className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-white/[0.04]"
                htmlFor={`col-vis-${col.id}`}
                key={col.id}
              >
                <Checkbox
                  checked={col.getIsVisible()}
                  id={`col-vis-${col.id}`}
                  onCheckedChange={(checked) =>
                    col.toggleVisibility(Boolean(checked))
                  }
                />
                <span className="truncate">{label}</span>
              </Label>
            )
          })}
        </div>
      </PopoverContent>
    </Popover>
  )
}
