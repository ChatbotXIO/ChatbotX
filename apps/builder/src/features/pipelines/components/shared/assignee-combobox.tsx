"use client"

import { Avatar, AvatarFallback } from "@chatbotx.io/ui/components/ui/avatar"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@chatbotx.io/ui/components/ui/command"
import { CheckIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { initials } from "@/features/contacts/lib/initials"
import type { AssigneeOption } from "../../lib/use-assignee-options"
import { toggle as toggleInList } from "../board/filter-helpers"

export type AssigneeSelection = { memberIds: string[]; teamIds: string[] }

const MAX_VISIBLE_AVATARS = 3
const MAX_COMPACT_AVATARS = 2

const isSelected = (option: AssigneeOption, value: AssigneeSelection) =>
  (option.kind === "member" ? value.memberIds : value.teamIds).includes(
    option.id,
  )

const toggle = (
  option: AssigneeOption,
  value: AssigneeSelection,
): AssigneeSelection => {
  const key = option.kind === "member" ? "memberIds" : "teamIds"
  return { ...value, [key]: toggleInList(value[key], option.id) }
}

const selectedAssignees = (
  options: AssigneeOption[],
  value: AssigneeSelection,
) => options.filter((option) => isSelected(option, value))

/** Stacked avatars of the selected assignees (members and teams). */
export function AssigneeAvatars({
  options,
  value,
  compact = false,
}: {
  options: AssigneeOption[]
  value: AssigneeSelection
  /** Smaller avatars and a round overflow badge, for board cards. */
  compact?: boolean
}) {
  const selected = selectedAssignees(options, value)
  const maxVisible = compact ? MAX_COMPACT_AVATARS : MAX_VISIBLE_AVATARS
  const extra = selected.length - maxVisible
  return (
    <span className="flex items-center -space-x-1.5">
      {selected.slice(0, maxVisible).map((option) => (
        <Avatar
          className={
            compact
              ? "size-5 ring-2 ring-card"
              : "size-6 border-2 border-background"
          }
          key={`${option.kind}:${option.id}`}
          title={option.label}
        >
          <AvatarFallback className={compact ? "text-[9px]" : "text-[10px]"}>
            {initials(option.label)}
          </AvatarFallback>
        </Avatar>
      ))}
      {extra > 0 && compact ? (
        <span className="z-10 flex size-5 items-center justify-center rounded-full bg-muted text-[9px] ring-2 ring-card">
          +{extra}
        </span>
      ) : null}
      {extra > 0 && !compact ? (
        <span className="ps-2.5 text-muted-foreground text-xs">+{extra}</span>
      ) : null}
    </span>
  )
}

/** Searchable multi-select list of workspace members and inbox teams. */
export function AssigneeChecklist({
  options,
  value,
  onChange,
  disabled,
}: {
  options: AssigneeOption[]
  value: AssigneeSelection
  onChange: (next: AssigneeSelection) => void
  disabled?: boolean
}) {
  const t = useTranslations("pipelines")
  const groups = [
    { kind: "member" as const, heading: t("item.assigneesMembers") },
    { kind: "team" as const, heading: t("item.assigneesTeams") },
  ]
  return (
    <Command className="rounded-md border">
      <CommandInput placeholder={t("item.assigneesSearch")} />
      <CommandList>
        <CommandEmpty>{t("item.assigneesEmpty")}</CommandEmpty>
        {groups.map(({ kind, heading }) => {
          const group = options.filter((option) => option.kind === kind)
          if (group.length === 0) {
            return null
          }
          return (
            <CommandGroup heading={heading} key={kind}>
              {group.map((option) => (
                <CommandItem
                  disabled={disabled}
                  key={option.id}
                  onSelect={() => onChange(toggle(option, value))}
                  value={`${option.label} ${kind}:${option.id}`}
                >
                  <CheckIcon
                    className={
                      isSelected(option, value) ? "opacity-100" : "opacity-0"
                    }
                  />
                  {option.label}
                </CommandItem>
              ))}
            </CommandGroup>
          )
        })}
      </CommandList>
    </Command>
  )
}
