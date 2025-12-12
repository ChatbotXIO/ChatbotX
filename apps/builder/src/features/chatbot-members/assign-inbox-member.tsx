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
import { useTranslations } from "next-intl"
import { useMemo, useState } from "react"
import { authClient } from "@/lib/auth/auth-client"
import type { ChatbotMemberResource } from "./schemas/resource"

type AssignInboxMemberProps = {
  agents: ChatbotMemberResource[]
}

export function AssignInboxMember({ agents }: AssignInboxMemberProps) {
  const t = useTranslations()

  const [open, setOpen] = useState(false)
  const [selectedAgent, setSelectedAgent] =
    useState<ChatbotMemberResource | null>(null)
  const { data: session } = authClient.useSession()

  const onSelectAgent = (agent: ChatbotMemberResource) => {
    setSelectedAgent(agent)
  }

  const agentLabel = useMemo(() => {
    if (selectedAgent && selectedAgent.user?.id === session?.user.id) {
      return t("assignAdmin.assignedToMe")
    }
    if (selectedAgent) {
      return t("assignAdmin.assignedTo", {
        name: selectedAgent.user?.name || selectedAgent.user?.email || "",
      })
    }
    return t("assignAdmin.designateConversation")
  }, [selectedAgent, t, session])

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
            {agents.map((agent) => (
              <CommandItem
                key={agent.id}
                onSelect={() => {
                  onSelectAgent(agent)
                  setOpen(false)
                }}
                value={agent.id}
              >
                {agent.user?.name || agent.user?.email}
              </CommandItem>
            ))}
          </CommandList>
        </Command>
        <Button
          className="mt-3 w-full"
          disabled={!selectedAgent}
          onClick={() => {
            setSelectedAgent(null)
            setOpen(false)
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
