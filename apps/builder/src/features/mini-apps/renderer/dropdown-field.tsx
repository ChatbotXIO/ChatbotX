"use client"

import type { MiniAppOption } from "@chatbotx.io/mini-app"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@chatbotx.io/ui/components/ui/popover"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { CheckIcon, ChevronDownIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { OptionImage } from "./option-image"

/**
 * WhatsApp-style dropdown. A native <select> cannot show option images or
 * colors, so the options open in a list that renders them.
 */
export function DropdownField({
  options,
  value,
  onChange,
  disabled,
}: {
  options: MiniAppOption[]
  value?: string
  onChange: (value: string | undefined) => void
  disabled: boolean
}) {
  const t = useTranslations("miniApps.view")
  const [open, setOpen] = useState(false)
  const selected = options.find((option) => option.id === value)

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger
        disabled={disabled}
        render={
          <button
            className="flex w-full items-center gap-2 rounded-md border border-[#d1d7db] bg-white px-3 py-2 text-start text-[#111b21] text-[15px] disabled:cursor-default"
            type="button"
          >
            {selected ? <OptionImage option={selected} size="sm" /> : null}
            <span
              className={cn("flex-1 truncate", !selected && "text-[#667781]")}
            >
              {selected?.title ?? t("selectPlaceholder")}
            </span>
            <ChevronDownIcon className="size-4 shrink-0 text-[#54656f]" />
          </button>
        }
      />
      <PopoverContent
        align="start"
        className="max-h-80 w-(--anchor-width) gap-0 overflow-y-auto bg-white p-1 text-[#111b21]"
      >
        {options.map((option) => (
          <button
            className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-start hover:bg-[#f0f2f5] disabled:opacity-50"
            disabled={option.enabled === false}
            key={option.id}
            onClick={() => {
              onChange(option.id)
              setOpen(false)
            }}
            type="button"
          >
            <OptionImage option={option} />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-[15px]">{option.title}</span>
              {option.description ? (
                <span className="text-[#667781] text-[13px]">
                  {option.description}
                </span>
              ) : null}
              {option.metadata ? (
                <span className="text-[#667781] text-[12px]">
                  {option.metadata}
                </span>
              ) : null}
            </span>
            {option.id === value ? (
              <CheckIcon className="size-4 shrink-0 text-[#008069]" />
            ) : null}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  )
}
