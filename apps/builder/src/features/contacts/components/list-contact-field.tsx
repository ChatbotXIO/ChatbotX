"use client"

import { Badge } from "@chatbotx.io/ui/components/ui/badge"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Checkbox } from "@chatbotx.io/ui/components/ui/checkbox"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@chatbotx.io/ui/components/ui/popover"
import { ChevronDownIcon, Loader2Icon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useMemo, useState } from "react"
import { toast } from "sonner"
import { updateContactFieldAction } from "../actions/update-contact-field.action"
import type { ContactEditableField } from "../schemas/resource"

type Props = {
  workspaceId: string
  contactId: string
  field: ContactEditableField
  onUpdated?: (key: string, value: string) => void
}

/**
 * Render do custom field type="list" no contact drawer (Inbox).
 * Display: chips dos selecionados (separados por ", " no value armazenado).
 * Click no trigger: abre Popover com checkboxes das `options` definidas
 * pelo admin em /settings/contact-fields. Save imediato a cada toggle.
 * Paridade Respond.io: gap #10 Fase D 2026-05-27.
 */
export function ListContactField({
  workspaceId,
  contactId,
  field,
  onUpdated,
}: Props) {
  const t = useTranslations()
  const [open, setOpen] = useState(false)

  // Value armazenado como CSV ("Básico, Premium"). Split pra array no render.
  const selected = useMemo(() => {
    if (!field.value) {
      return []
    }
    return field.value
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  }, [field.value])

  const options = field.options ?? []

  const { execute, isPending } = useAction(
    updateContactFieldAction.bind(null, workspaceId, contactId),
    {
      onSuccess: () => {
        onUpdated?.(field.key, selected.join(", "))
      },
      onError: ({ error }) => {
        if (error.serverError) {
          toast.error(error.serverError)
        }
      },
    },
  )

  const handleToggle = (item: string, checked: boolean) => {
    const next = checked
      ? [...selected, item]
      : selected.filter((s) => s !== item)
    const csv = next.join(", ")
    execute({ [field.key]: csv } as never)
  }

  return (
    <div className="flex w-full min-w-0 flex-col gap-0.5">
      <label
        className="truncate font-normal text-[14px] text-text-secondary"
        htmlFor={`field-${field.key}`}
      >
        {field.label}
      </label>
      <Popover onOpenChange={setOpen} open={open}>
        <PopoverTrigger asChild>
          <Button
            className="h-auto min-h-7 w-full justify-between border-0 bg-transparent px-1 py-1 text-[14px] text-text-secondary shadow-none hover:bg-white/[0.04]"
            disabled={isPending || options.length === 0}
            id={`field-${field.key}`}
            type="button"
            variant="ghost"
          >
            <div className="flex min-w-0 flex-wrap items-center gap-1">
              {selected.length > 0 ? (
                selected.map((s) => (
                  <Badge
                    className="px-1.5 py-0 text-xs"
                    key={s}
                    variant="secondary"
                  >
                    {s}
                  </Badge>
                ))
              ) : (
                <span className="text-text-tertiary">
                  {options.length === 0
                    ? t("customFields.emptyOptions")
                    : `${t("actions.add") ?? "Adicionar"} ${field.label}`}
                </span>
              )}
            </div>
            {isPending ? (
              <Loader2Icon className="size-3 shrink-0 animate-spin" />
            ) : (
              <ChevronDownIcon className="size-3 shrink-0 opacity-50" />
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-56 p-2">
          {options.length === 0 ? (
            <p className="px-2 py-1 text-text-secondary text-xs">
              {t("customFields.emptyOptions")}
            </p>
          ) : (
            <div className="flex flex-col gap-0.5">
              {options.map((opt) => {
                const checked = selected.includes(opt)
                return (
                  <label
                    className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-white/[0.04]"
                    htmlFor={`opt-${field.key}-${opt}`}
                    key={opt}
                  >
                    <Checkbox
                      checked={checked}
                      id={`opt-${field.key}-${opt}`}
                      onCheckedChange={(c) => handleToggle(opt, Boolean(c))}
                    />
                    <span className="flex-1">{opt}</span>
                  </label>
                )
              })}
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  )
}
