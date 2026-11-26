"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@chatbotx.io/ui/components/ui/dialog"
import { Skeleton } from "@chatbotx.io/ui/components/ui/skeleton"
import { useFormatter, useTranslations } from "next-intl"
import { useWorkspaceId } from "@/hooks/routing"
import { useConversationParticipants } from "../hooks/use-conversation-participants"
import type {
  ConversationParticipantResource,
  ListConversationItemResource,
} from "../schema/resource"
import { ParticipantAvatar } from "./participant-avatar"

const REPLY_TIME_FORMAT = {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
} as const

/**
 * Under the contact name: who replied in this conversation and when the last
 * reply was. Click opens a dialog with the full list, newest first. The row's
 * `recentParticipants` stands in while the list loads or if it fails, so the
 * header never blocks on this request. Hidden when nobody has replied.
 */
export function ConversationParticipants({
  conversation,
}: {
  conversation: ListConversationItemResource
}) {
  const t = useTranslations("conversationParticipants")
  const tShared = useTranslations()
  const format = useFormatter()
  const workspaceId = useWorkspaceId()
  const query = useConversationParticipants(workspaceId, conversation.id)

  const loaded = query.data?.pages.flatMap((page) => page.data)
  const participants: readonly ConversationParticipantResource[] =
    loaded ?? conversation.recentParticipants
  const latest = participants[0]
  if (!latest) {
    return null
  }

  const nameOf = (participant: ConversationParticipantResource) =>
    participant.name ?? t("unnamedMember")
  const timeOf = (participant: ConversationParticipantResource) =>
    format.dateTime(participant.lastRepliedAt, REPLY_TIME_FORMAT)

  return (
    <Dialog>
      <DialogTrigger
        render={
          <button
            className="flex min-w-0 max-w-full items-center gap-1 text-start text-muted-foreground text-xs hover:text-foreground"
            type="button"
          >
            <span className="truncate">
              {t("joined", {
                names: format.list(participants.map(nameOf), {
                  type: "unit",
                  style: "long",
                }),
              })}
            </span>
            <span aria-hidden>•</span>
            <time
              className="shrink-0"
              dateTime={latest.lastRepliedAt.toISOString()}
            >
              {timeOf(latest)}
            </time>
          </button>
        }
      />
      {/* `minmax(0, 1fr)`: the default `auto` track grows to the longest name and overflows the dialog. */}
      <DialogContent className="grid-cols-[minmax(0,1fr)] sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("label")}</DialogTitle>
        </DialogHeader>
        <ul
          aria-label={t("label")}
          className="flex max-h-[60vh] flex-col gap-3 overflow-y-auto"
        >
          {participants.map((participant) => (
            <li
              className="flex items-center gap-3 text-sm"
              key={participant.userId}
            >
              <ParticipantAvatar className="size-8" participant={participant} />
              <span className="wrap-break-word min-w-0 flex-1">
                {t("replied", {
                  name: nameOf(participant),
                  time: timeOf(participant),
                })}
              </span>
            </li>
          ))}
        </ul>
        {query.isError && !query.data && (
          // The first load failed: the list above is only the row's preview.
          <div
            className="flex items-center gap-2 text-muted-foreground text-xs"
            role="alert"
          >
            <span>{tShared("messages.errorLoadingData")}</span>
            <Button
              onClick={() => query.refetch()}
              size="sm"
              type="button"
              variant="ghost"
            >
              {tShared("actions.retry")}
            </Button>
          </div>
        )}
        {query.isFetchingNextPage && <Skeleton className="h-6 w-full" />}
        {query.isFetchNextPageError && (
          <p className="text-destructive text-xs" role="alert">
            {t("loadMoreFailed")}
          </p>
        )}
        {query.hasNextPage && !query.isFetchingNextPage && (
          <Button
            onClick={() => query.fetchNextPage()}
            size="sm"
            type="button"
            variant="ghost"
          >
            {t("showMore")}
          </Button>
        )}
      </DialogContent>
    </Dialog>
  )
}
