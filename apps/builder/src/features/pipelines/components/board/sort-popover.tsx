"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@chatbotx.io/ui/components/ui/popover"
import {
  RadioGroup,
  RadioGroupItem,
} from "@chatbotx.io/ui/components/ui/radio-group"
import { ArrowDownUpIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import type { BoardSortInput } from "./types"

/** Display order: value, due date, priority, update date, date created. */
const SORT_OPTIONS: ReadonlyArray<{
  value: string
  sort: BoardSortInput
  labelKey: string
}> = [
  {
    value: "value:desc",
    sort: { key: "value", direction: "desc" },
    labelKey: "board.sortOptions.valueDesc",
  },
  {
    value: "value:asc",
    sort: { key: "value", direction: "asc" },
    labelKey: "board.sortOptions.valueAsc",
  },
  {
    value: "dueDate:asc",
    sort: { key: "dueDate", direction: "asc" },
    labelKey: "board.sortOptions.dueDateAsc",
  },
  {
    value: "dueDate:desc",
    sort: { key: "dueDate", direction: "desc" },
    labelKey: "board.sortOptions.dueDateDesc",
  },
  {
    value: "priority:desc",
    sort: { key: "priority", direction: "desc" },
    labelKey: "board.sortOptions.priorityDesc",
  },
  {
    value: "priority:asc",
    sort: { key: "priority", direction: "asc" },
    labelKey: "board.sortOptions.priorityAsc",
  },
  {
    value: "updatedAt:desc",
    sort: { key: "updatedAt", direction: "desc" },
    labelKey: "board.sortOptions.updatedAtDesc",
  },
  {
    value: "updatedAt:asc",
    sort: { key: "updatedAt", direction: "asc" },
    labelKey: "board.sortOptions.updatedAtAsc",
  },
  {
    value: "createdAt:desc",
    sort: { key: "createdAt", direction: "desc" },
    labelKey: "board.sortOptions.createdAtDesc",
  },
  {
    value: "createdAt:asc",
    sort: { key: "createdAt", direction: "asc" },
    labelKey: "board.sortOptions.createdAtAsc",
  },
]

type SortPopoverProps = {
  sort: BoardSortInput
  /** Sort keys whose pipeline feature is hidden; their options are not offered. */
  hiddenKeys?: ReadonlySet<string>
  onChange: (sort: BoardSortInput) => void
}

/** Radio list of the board sort orders; writes the same `sort`/`dir` as the URL params. */
export function SortPopover({ sort, hiddenKeys, onChange }: SortPopoverProps) {
  const t = useTranslations("pipelines")
  const current = `${sort.key}:${sort.direction}`

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button size="sm" variant="ghost">
            <ArrowDownUpIcon />
            {t("board.sort")}
          </Button>
        }
      />
      <PopoverContent align="center" className="w-auto min-w-64 gap-1 p-1.5">
        <RadioGroup
          aria-label={t("board.sort")}
          className="gap-0.5"
          onValueChange={(value) => {
            const option = SORT_OPTIONS.find((entry) => entry.value === value)
            if (option) {
              onChange(option.sort)
            }
          }}
          value={current}
        >
          {SORT_OPTIONS.filter(
            (option) => !hiddenKeys?.has(option.sort.key),
          ).map((option) => (
            // biome-ignore lint/a11y/noLabelWithoutControl: RadioGroupItem renders the control inside the label
            <label
              className={`flex cursor-pointer items-center gap-2 whitespace-nowrap rounded-md px-2 py-1.5 text-sm hover:bg-accent ${
                option.value === current ? "font-medium text-primary" : ""
              }`}
              key={option.value}
            >
              <RadioGroupItem value={option.value} />
              {t(option.labelKey)}
            </label>
          ))}
        </RadioGroup>
      </PopoverContent>
    </Popover>
  )
}
