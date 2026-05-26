"use client"

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@chatbotx.io/ui/components/ui/avatar"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@chatbotx.io/ui/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@chatbotx.io/ui/components/ui/popover"
import { CheckIcon, UserIcon, UsersRoundIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { type ReactElement, useState } from "react"
import { toast } from "sonner"
import {
  getAvatarInitials,
  getRespondAvatarUrl,
} from "@/features/contacts/utils"
import { useUserStore } from "@/features/users/provider/user-store-context"
import { useWorkspaceId } from "@/hooks/routing"
import { assignConversationAction } from "../actions/assign-conversation.action"

type AssignConversationPopoverProps = {
  trigger: ReactElement
  assignedId?: string | null
  contactIds: string[]
  showRemove?: boolean
  onSuccess?: (value: string | null) => void
}

// Popover inline (não modal!) com lista searchable de agentes + equipes.
// Substitui o `AssignConversationDialog` que abria modal centralizado —
// Pedro pediu pixel-perfect Respond.io 2026-05-25, onde o dropdown ancora
// no botão do header com:
//   [Search box]
//   [Eliminar atribuição]
//   ──────
//   Agentes
//     [avatar] Nome 1
//     [avatar] Nome 2
//   Equipes
//     [👥] Time A
export function AssignConversationPopover({
  trigger,
  assignedId,
  contactIds,
  showRemove = true,
  onSuccess,
}: AssignConversationPopoverProps) {
  const t = useTranslations()
  const [open, setOpen] = useState(false)
  const workspaceId = useWorkspaceId()
  const { workspaceMembers, inboxTeams } = useUserStore((state) => state)

  const { execute, isExecuting } = useAction(
    assignConversationAction.bind(null, workspaceId),
    {
      onSuccess: () => {
        setOpen(false)
      },
      onError: ({ error }) => {
        if (error.serverError) {
          toast.error(error.serverError)
        }
      },
    },
  )

  const handleSelect = (value: string | null) => {
    onSuccess?.(value)
    execute({ contactIds, assignedId: value })
  }

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-0" sideOffset={4}>
        <Command>
          <CommandInput placeholder={t("actions.search") ?? "Search"} />
          <CommandList>
            <CommandEmpty>{t("messages.noResultsFound")}</CommandEmpty>

            {showRemove && (
              <CommandGroup>
                <CommandItem
                  className="gap-2"
                  disabled={isExecuting}
                  onSelect={() => handleSelect(null)}
                >
                  <div
                    className="grid size-5 shrink-0 place-items-center rounded-full text-white"
                    style={{ backgroundColor: "#A63D40" }}
                  >
                    <UserIcon size={11} strokeWidth={2.25} />
                  </div>
                  <span className="flex-1 truncate">
                    {t("actions.removeAssignee")}
                  </span>
                  {!assignedId && (
                    <CheckIcon className="size-3.5 text-primary" />
                  )}
                </CommandItem>
              </CommandGroup>
            )}

            {workspaceMembers.length > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup heading={t("fields.agent.label")}>
                  {workspaceMembers.map((member) => {
                    const user = member.user
                    if (!user) {
                      return null
                    }
                    const value = `u_${user.id}`
                    const isCurrent = value === assignedId
                    const displayName: string = user.name || "?"
                    // Iter 41: seed = user.id pra consistência.
                    const avatarSpec = getRespondAvatarUrl(
                      user.id ?? displayName,
                    )
                    const initials = getAvatarInitials(displayName) || "?"
                    return (
                      <CommandItem
                        className="gap-2"
                        disabled={isExecuting}
                        key={value}
                        onSelect={() => handleSelect(value)}
                        value={`${displayName} ${value}`}
                      >
                        <Avatar className="size-5 shrink-0">
                          {/* Iter 42: fallback = respond-avatar */}
                          <AvatarImage
                            alt={displayName}
                            className="object-cover"
                            src={user.image || avatarSpec.url}
                          />
                          <AvatarFallback
                            className="font-semibold text-[9px] text-white"
                            style={{ backgroundColor: avatarSpec.color }}
                          >
                            {initials}
                          </AvatarFallback>
                        </Avatar>
                        <span className="flex-1 truncate">{displayName}</span>
                        {isCurrent && (
                          <CheckIcon className="size-3.5 text-primary" />
                        )}
                      </CommandItem>
                    )
                  })}
                </CommandGroup>
              </>
            )}

            {inboxTeams.length > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup heading={t("fields.team.label")}>
                  {inboxTeams.map((team) => {
                    const value = `t_${team.id}`
                    const isCurrent = value === assignedId
                    return (
                      <CommandItem
                        className="gap-2"
                        disabled={isExecuting}
                        key={value}
                        onSelect={() => handleSelect(value)}
                        value={`${team.name} ${value}`}
                      >
                        <div className="grid size-5 shrink-0 place-items-center overflow-hidden rounded-full border border-zinc-600 bg-secondary text-text-secondary">
                          <UsersRoundIcon size={11} strokeWidth={1.75} />
                        </div>
                        <span className="flex-1 truncate">{team.name}</span>
                        {isCurrent && (
                          <CheckIcon className="size-3.5 text-primary" />
                        )}
                      </CommandItem>
                    )
                  })}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
