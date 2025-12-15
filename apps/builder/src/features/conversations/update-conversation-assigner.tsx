"use client"

import type { UserModel } from "@aha.chat/database/types"
import { Button } from "@aha.chat/ui/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@aha.chat/ui/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@aha.chat/ui/components/ui/popover"
import { ChevronDownIcon } from "lucide-react"
import { useParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { authClient } from "@/lib/auth/auth-client"
import type { ClientConversationResource } from "../chat/store/chat-store"
import type { ChatbotMemberResource } from "../chatbot-members/schemas/resource"
import { updateConversationAssignerAction } from "./actions/update-conversation-assigner.action"

type UpdateConversationAssignerProps = {
  conversation: ClientConversationResource
  agents: ChatbotMemberResource[]
  onChange: (user: UserModel | null) => void
}

export function UpdateConversationAssigner({
  conversation,
  agents,
  onChange,
}: UpdateConversationAssignerProps) {
  const t = useTranslations()
  const { chatbotId } = useParams<{ chatbotId: string }>()

  const [open, setOpen] = useState(false)
  const { data: session } = authClient.useSession()

  const options: { label: string; value: string }[] = agents.map((agent) => ({
    label:
      agent.user?.id === session?.user.id
        ? t("assignAdmin.assignedToMe")
        : agent.user?.name || agent.user?.email || "Unknown",
    value: agent.user?.id || "",
  }))
  const [selectedAgent, setSelectedAgent] =
    useState<ChatbotMemberResource | null>(null)

  const onSelectAgent = useCallback(
    async (option: { label: string; value: string } | null) => {
      try {
        const agent = option
          ? agents.find((a) => a.user?.id === option.value) || null
          : null
        setSelectedAgent(agent)
        await updateConversationAssignerAction(chatbotId, {
          conversationId: conversation ? conversation.id : "",
          assignedUserId: option ? option.value : null,
        })
        onChange(agent?.user || null)
        setOpen(false)
      } catch (_e) {
        toast.error(t("assignAdmin.updateAssignerError"))
      }
    },
    [chatbotId, conversation, onChange, agents, t],
  )

  const agentLabel = useMemo(() => {
    if (selectedAgent && selectedAgent.user?.id === session?.user.id) {
      return t("assignAdmin.assignedToMe")
    }
    if (selectedAgent) {
      return t("assignAdmin.assignedTo", {
        name: selectedAgent.user?.name || selectedAgent.user?.email || "",
      })
    }
    return t("assignAdmin.assignConversation")
  }, [selectedAgent, t, session])

  useEffect(() => {
    setSelectedAgent(
      conversation.assignedUserId
        ? agents.find(
            (agent) => agent.user?.id === conversation.assignedUserId,
          ) || null
        : null,
    )
  }, [conversation, agents])

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger asChild>
        <div className="flex items-center">
          <span className="cursor-pointer text-gray-500 text-xs">
            {agentLabel}
          </span>
          <ChevronDownIcon className="ml-1 inline-block size-4" />
        </div>
      </PopoverTrigger>
      <PopoverContent align="start">
        <Command className="rounded-lg border">
          <CommandInput className="h-9" placeholder="Search..." />
          <CommandList>
            <CommandEmpty>No record found.</CommandEmpty>
            {options.map((option) => (
              <CommandItem
                key={option.value}
                onSelect={() => {
                  onSelectAgent(option)
                }}
                value={option.value}
              >
                {option.label}
              </CommandItem>
            ))}
          </CommandList>
        </Command>
        <Button
          className="mt-3 w-full"
          disabled={!selectedAgent}
          onClick={() => {
            onSelectAgent(null)
          }}
          size="sm"
          variant="outline"
        >
          {t("assignAdmin.removeAssigner")}
        </Button>
      </PopoverContent>
    </Popover>
  )
}
