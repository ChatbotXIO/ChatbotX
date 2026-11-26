"use client"

import { Badge } from "@chatbotx.io/ui/components/ui/badge"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Checkbox } from "@chatbotx.io/ui/components/ui/checkbox"
import { Input } from "@chatbotx.io/ui/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@chatbotx.io/ui/components/ui/popover"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Loader2Icon, PlusIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { toast } from "sonner"
import { orpc } from "@/lib/orpc/query"

type PostTopicLabel = { color: string | null; id: string; name: string }

export const PostTopicBadges = ({ topics }: { topics: PostTopicLabel[] }) => (
  <>
    {topics.map((topic) => (
      <Badge
        className="max-w-28 shrink-0 truncate border bg-muted/50 text-foreground"
        key={topic.id}
        style={
          topic.color
            ? { borderInlineStartColor: topic.color, borderInlineStartWidth: 3 }
            : undefined
        }
        variant="outline"
      >
        {topic.name}
      </Badge>
    ))}
  </>
)

/**
 * Pick or create the topics of one post. The list is fetched only once the
 * popover opens, so a page of posts costs no topic request until someone asks.
 */
export const PostTopicPicker = ({
  disabled,
  onChange,
  selected,
  workspaceId,
}: {
  disabled: boolean
  onChange: (topicIds: string[]) => void
  selected: PostTopicLabel[]
  workspaceId: string
}) => {
  const t = useTranslations()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")

  const topics = useQuery(
    orpc.channelPostManagementAPIs.privateListPostTopicsAPI.queryOptions({
      enabled: open,
      input: { workspaceId },
    }),
  )
  const createTopic = useMutation(
    orpc.channelPostManagementAPIs.privateCreatePostTopicAPI.mutationOptions({
      onError: (error) => toast.error(error.message),
      onSuccess: async (topic) => {
        await queryClient.invalidateQueries({
          queryKey:
            orpc.channelPostManagementAPIs.privateListPostTopicsAPI.key(),
        })
        setName("")
        onChange([...selected.map((item) => item.id), topic.id])
      },
    }),
  )

  const selectedIds = new Set(selected.map((topic) => topic.id))
  const toggle = (topicId: string) => {
    const next = new Set(selectedIds)
    if (!next.delete(topicId)) {
      next.add(topicId)
    }
    onChange([...next])
  }
  const trimmed = name.trim()

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger
        render={
          <Button
            aria-label={t("posts.topics.edit")}
            className="text-muted-foreground"
            disabled={disabled}
            size="icon"
            variant="ghost"
          >
            <PlusIcon />
          </Button>
        }
      />
      <PopoverContent align="start" className="w-64 space-y-2 p-2">
        <form
          className="flex gap-1"
          onSubmit={(event) => {
            event.preventDefault()
            if (trimmed) {
              createTopic.mutate({ name: trimmed, workspaceId })
            }
          }}
        >
          <Input
            maxLength={100}
            onChange={(event) => setName(event.target.value)}
            placeholder={t("posts.topics.newPlaceholder")}
            value={name}
          />
          <Button
            disabled={!trimmed || createTopic.isPending}
            size="sm"
            type="submit"
          >
            {t("actions.add")}
          </Button>
        </form>
        <div className="max-h-56 space-y-1 overflow-y-auto">
          {topics.isPending ? (
            <div className="flex justify-center py-3">
              <Loader2Icon className="size-4 animate-spin text-muted-foreground" />
            </div>
          ) : null}
          {topics.isError ? (
            <p className="px-1 text-destructive text-sm">
              {t("messages.errorLoadingData")}
            </p>
          ) : null}
          {topics.data?.items.length === 0 ? (
            <p className="px-1 text-muted-foreground text-sm">
              {t("posts.topics.empty")}
            </p>
          ) : null}
          {topics.data?.items.map((topic) => (
            // biome-ignore lint/a11y/noLabelWithoutControl: the Checkbox renders the control
            <label
              className="flex min-h-9 cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm focus-within:bg-muted hover:bg-muted"
              key={topic.id}
            >
              <Checkbox
                checked={selectedIds.has(topic.id)}
                onCheckedChange={() => toggle(topic.id)}
              />
              <span className="truncate">{topic.name}</span>
            </label>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
