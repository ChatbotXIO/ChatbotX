"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@chatbotx.io/ui/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@chatbotx.io/ui/components/ui/popover"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { Check, ChevronsUpDown } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { useLeaderboardOptions } from "../../lib/use-leaderboard-options"

/** Quick, searchable switch to another leaderboard's participants, with participant counts. */
export function LeaderboardSwitcher({
  workspaceId,
  leaderboardId,
  currentName,
}: {
  workspaceId: string
  leaderboardId: string
  currentName: string
}) {
  const t = useTranslations()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const { leaderboards } = useLeaderboardOptions()
  const items = leaderboards.some((item) => item.id === leaderboardId)
    ? leaderboards
    : [
        { id: leaderboardId, name: currentName, participants: 0 },
        ...leaderboards,
      ]
  const currentLabel =
    items.find((item) => item.id === leaderboardId)?.name ?? currentName

  const handleSelect = (value: string) => {
    setOpen(false)
    if (value !== leaderboardId) {
      router.push(`/space/${workspaceId}/leaderboards/${value}/participants`)
    }
  }

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger
        render={
          <Button
            aria-expanded={open}
            aria-label={t("leaderboards.participants.switcher")}
            className="w-64 justify-between"
            role="combobox"
            variant="outline"
          >
            <span className="min-w-0 truncate">{currentLabel}</span>
            <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
          </Button>
        }
      />
      <PopoverContent align="start" className="w-80 p-0">
        <Command>
          <CommandInput className="h-9" placeholder={t("actions.search")} />
          <CommandList>
            <CommandEmpty>{t("actions.noRecordFound")}</CommandEmpty>
            <CommandGroup>
              {items.map((item) => (
                <CommandItem
                  key={item.id}
                  keywords={[item.name]}
                  onSelect={() => handleSelect(item.id)}
                  value={item.id}
                >
                  <Check
                    className={cn(
                      "size-4 shrink-0",
                      item.id === leaderboardId ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <span className="truncate">{item.name}</span>
                  <span className="ms-auto shrink-0 text-muted-foreground text-xs">
                    {t("leaderboards.participants.count", {
                      count: item.participants,
                    })}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
