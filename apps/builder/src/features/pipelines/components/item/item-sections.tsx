"use client"

import type {
  PipelineActivityGroup,
  PipelineActorKind,
  PipelineItemStatus,
} from "@chatbotx.io/database/partials"
import { Avatar, AvatarFallback } from "@chatbotx.io/ui/components/ui/avatar"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Skeleton } from "@chatbotx.io/ui/components/ui/skeleton"
import { Textarea } from "@chatbotx.io/ui/components/ui/textarea"
import { getPublicFileUrl } from "@chatbotx.io/utils"
import {
  HistoryIcon,
  Loader2Icon,
  MessageSquareIcon,
  MessageSquarePlusIcon,
  PaperclipIcon,
  PlusIcon,
  XIcon,
} from "lucide-react"
import Image from "next/image"
import { useFormatter, useLocale, useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useState } from "react"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { initials } from "@/features/contacts/lib/initials"
import { FileTypeIcon } from "@/features/media-library/components/file-type-icon"
import { MediaLibraryTrigger } from "@/features/media-library/components/media-library-trigger"
import { useTenantSettings } from "@/features/tenant"
import {
  addAttachmentsAction,
  addCommentAction,
  deleteCommentAction,
  removeAttachmentAction,
} from "../../actions/item.action"
import {
  AUTOMATION_ACTORS,
  activityActorLabel,
  UNKNOWN_MEMBER_LABEL,
} from "../../lib/activity-actor"
import {
  type ActivityChangeFields,
  type ActivityChangeLabels,
  activityChange,
} from "../../lib/activity-change"
import { formatItemValue } from "../../lib/format-item-value"
import { activityKeys, priorityKeys } from "../../lib/item-noun"
import { usePipelineAction } from "../../lib/use-pipeline-action"
import { ActivityFilter } from "./activity-filter"

type SectionContext = {
  workspaceId: string
  pipelineId: string
  itemId: string
  canEdit: boolean
}

type Comment = {
  id: string
  text: string
  createdAt: Date
  createdById: string | null
}

export function CommentsSection({
  context,
  comments,
  total,
  authorNames,
  hasMore,
  isLoadingMore,
  onLoadMore,
  canDelete,
}: {
  context: SectionContext
  /** Loaded pages, newest first; `undefined` while loading or after a failed load. */
  comments: Comment[] | undefined
  /** Every comment of the item, not just the loaded pages. */
  total: number
  /** Workspace member names by user id, for the comment author line. */
  authorNames: ReadonlyMap<string, string>
  hasMore: boolean
  isLoadingMore: boolean
  onLoadMore: () => void
  canDelete: boolean
}) {
  const t = useTranslations("pipelines")
  const format = useFormatter()
  const tc = useTranslations("actions")
  const [text, setText] = useState("")
  const [composing, setComposing] = useState(false)
  const add = useAction(
    addCommentAction.bind(null, context.workspaceId),
    usePipelineAction({
      onDone: () => {
        setText("")
        setComposing(false)
      },
    }),
  )
  const [deletingCommentId, setDeletingCommentId] = useState<string | null>(
    null,
  )
  const remove = useAction(
    deleteCommentAction.bind(null, context.workspaceId),
    usePipelineAction({ onDone: () => setDeletingCommentId(null) }),
  )

  return (
    <section className="grid gap-3 border-t pt-5">
      <h3 className="flex items-center gap-2 font-medium text-sm">
        <MessageSquareIcon className="size-4 text-muted-foreground" />
        {t("item.comments")} ({total})
      </h3>
      {context.canEdit && !composing ? (
        <Button
          className="w-full"
          onClick={() => setComposing(true)}
          size="sm"
          variant="outline"
        >
          <MessageSquarePlusIcon />
          {t("item.addComment")}
        </Button>
      ) : null}
      {context.canEdit && composing ? (
        <div className="grid gap-2">
          <Textarea
            aria-label={t("item.addComment")}
            autoFocus
            maxLength={2000}
            onChange={(event) => setText(event.target.value)}
            placeholder={t("item.commentPlaceholder")}
            value={text}
          />
          <div className="flex justify-end gap-2">
            <Button
              onClick={() => {
                setText("")
                setComposing(false)
              }}
              size="sm"
              variant="outline"
            >
              {tc("cancel")}
            </Button>
            <Button
              disabled={add.isPending || text.trim().length === 0}
              onClick={() =>
                add.execute({
                  id: context.pipelineId,
                  itemId: context.itemId,
                  text: text.trim(),
                })
              }
              size="sm"
            >
              {add.isPending ? <Loader2Icon className="animate-spin" /> : null}
              {t("item.addComment")}
            </Button>
          </div>
        </div>
      ) : null}
      {comments?.length === 0 ? (
        <p className="text-muted-foreground text-xs">{t("item.noComments")}</p>
      ) : null}
      <ul className="grid gap-2">
        {(comments ?? []).map((comment) => (
          <li className="rounded-lg border p-2 text-sm" key={comment.id}>
            <p className="whitespace-pre-wrap">{comment.text}</p>
            <div className="mt-1 flex items-center justify-between text-muted-foreground text-xs">
              <span>
                {comment.createdById && authorNames.get(comment.createdById)
                  ? `${authorNames.get(comment.createdById)} · `
                  : ""}
                {format.dateTime(comment.createdAt, {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </span>
              {canDelete ? (
                <Button
                  aria-label={t("item.deleteComment")}
                  className="size-6"
                  disabled={remove.isPending}
                  onClick={() => setDeletingCommentId(comment.id)}
                  size="icon"
                  variant="ghost"
                >
                  <XIcon />
                </Button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
      {hasMore ? (
        <Button
          className="justify-self-center"
          disabled={isLoadingMore}
          onClick={onLoadMore}
          size="sm"
          variant="ghost"
        >
          {isLoadingMore ? <Loader2Icon className="animate-spin" /> : null}
          {t("item.olderComments")}
        </Button>
      ) : null}
      <ConfirmDialog
        confirmLabel={t("item.deleteComment")}
        description={t("item.deleteCommentDescription")}
        destructive
        isPending={remove.isPending}
        onConfirm={() => {
          if (deletingCommentId) {
            remove.execute({
              id: context.pipelineId,
              itemId: context.itemId,
              commentId: deletingCommentId,
            })
          }
        }}
        onOpenChange={(open) => {
          if (!(open || remove.isPending)) {
            setDeletingCommentId(null)
          }
        }}
        open={deletingCommentId !== null}
        title={t("item.deleteComment")}
      />
    </section>
  )
}

type Attachment = {
  mediaLibraryFile: {
    id: string
    name: string
    mimeType: string
    size: number
    path?: string | null
  }
}

/** Image preview of an attachment, or its file-type icon (also when the file is gone). */
function AttachmentThumbnail({
  file,
  storageUrl,
}: {
  file: Attachment["mediaLibraryFile"]
  storageUrl: string
}) {
  return (
    <span className="relative flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted">
      {file.path && file.mimeType.startsWith("image/") ? (
        <Image
          alt={file.name}
          className="object-cover"
          fill
          sizes="40px"
          src={getPublicFileUrl(file.path, storageUrl)}
        />
      ) : (
        <FileTypeIcon className="size-5" mimeType={file.mimeType} />
      )}
    </span>
  )
}

export function AttachmentsSection({
  context,
  attachments,
  canDelete,
}: {
  context: SectionContext
  attachments: Attachment[]
  canDelete: boolean
}) {
  const t = useTranslations("pipelines")
  const { storageUrl } = useTenantSettings()
  const add = useAction(
    addAttachmentsAction.bind(null, context.workspaceId),
    usePipelineAction(),
  )
  const [removingFileId, setRemovingFileId] = useState<string | null>(null)
  const remove = useAction(
    removeAttachmentAction.bind(null, context.workspaceId),
    usePipelineAction({ onDone: () => setRemovingFileId(null) }),
  )

  return (
    <section className="grid gap-3 border-t pt-5">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 font-medium text-sm">
          <PaperclipIcon className="size-4 text-muted-foreground" />
          {t("item.attachments")}
          {attachments.length > 0 ? ` (${attachments.length})` : ""}
        </h3>
        {context.canEdit ? (
          <MediaLibraryTrigger
            multiple
            onSelect={() => undefined}
            onSelectMultiple={(files) =>
              add.execute({
                id: context.pipelineId,
                itemId: context.itemId,
                mediaLibraryFileIds: files.map((file) => file.id),
              })
            }
            workspaceId={context.workspaceId}
          >
            <Button size="sm" variant="outline">
              <PlusIcon />
              {t("item.attach")}
            </Button>
          </MediaLibraryTrigger>
        ) : null}
      </div>
      {attachments.length === 0 ? (
        <p className="text-muted-foreground text-xs">
          {t("item.noAttachments")}
        </p>
      ) : null}
      <ul className="grid gap-1">
        {attachments.map(({ mediaLibraryFile }) => (
          <li
            className="flex items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-sm"
            key={mediaLibraryFile.id}
          >
            <span className="flex min-w-0 items-center gap-2">
              <AttachmentThumbnail
                file={mediaLibraryFile}
                storageUrl={storageUrl}
              />
              {mediaLibraryFile.path ? (
                <a
                  className="truncate hover:underline"
                  download={mediaLibraryFile.name}
                  href={getPublicFileUrl(mediaLibraryFile.path, storageUrl)}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  {mediaLibraryFile.name}
                </a>
              ) : (
                <span className="truncate">{mediaLibraryFile.name}</span>
              )}
            </span>
            {canDelete ? (
              <Button
                aria-label={t("item.removeAttachment")}
                className="size-6"
                disabled={remove.isPending}
                onClick={() => setRemovingFileId(mediaLibraryFile.id)}
                size="icon"
                variant="ghost"
              >
                <XIcon />
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
      <ConfirmDialog
        confirmLabel={t("item.removeAttachment")}
        description={t("item.removeAttachmentDescription")}
        destructive
        isPending={remove.isPending}
        onConfirm={() => {
          if (removingFileId) {
            remove.execute({
              id: context.pipelineId,
              itemId: context.itemId,
              mediaLibraryFileId: removingFileId,
            })
          }
        }}
        onOpenChange={(open) => {
          if (!(open || remove.isPending)) {
            setRemovingFileId(null)
          }
        }}
        open={removingFileId !== null}
        title={t("item.removeAttachment")}
      />
    </section>
  )
}

type Activity = ActivityChangeFields & {
  id: string
  occurredAt: Date
  actorKind: PipelineActorKind
  actorUserId: string | null
}

export function ActivitySection({
  activity,
  currency,
  statusLabels,
  actorNames,
  actorNamesFailed,
  hasMore,
  isLoadingMore,
  onLoadMore,
  groups,
  onGroupsChange,
  isLoading,
}: {
  activity: Activity[]
  currency: string
  statusLabels: Record<PipelineItemStatus, string>
  /** Workspace member names by user id; undefined until they load. */
  actorNames: ReadonlyMap<string, string> | undefined
  /** The member list failed to load: names are unknown, not "former". */
  actorNamesFailed: boolean
  hasMore: boolean
  isLoadingMore: boolean
  onLoadMore: () => void
  /** Kinds of change shown; empty shows all. */
  groups: readonly PipelineActivityGroup[]
  onGroupsChange: (groups: PipelineActivityGroup[]) => void
  /** The first page (for the current filter) is loading. */
  isLoading: boolean
}) {
  const t = useTranslations("pipelines")
  const format = useFormatter()
  const locale = useLocale()
  const labels: ActivityChangeLabels = {
    status: (status) => statusLabels[status],
    priority: (priority) => t(priorityKeys[priority]),
    value: (value) => formatItemValue(value, currency, locale),
    date: (date) =>
      format.dateTime(date, { dateStyle: "medium", timeStyle: "short" }),
  }

  return (
    <section className="grid gap-3 border-t pt-5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 font-medium text-sm">
          <HistoryIcon className="size-4 text-muted-foreground" />
          {t("item.activity")}
        </h3>
        <ActivityFilter groups={groups} onGroupsChange={onGroupsChange} />
      </div>
      {isLoading ? (
        <Loader2Icon
          aria-label={t("item.activity")}
          className="size-4 animate-spin justify-self-center text-muted-foreground"
        />
      ) : null}
      {!isLoading && activity.length === 0 ? (
        <p className="text-muted-foreground text-xs">
          {groups.length > 0
            ? t("item.noFilteredActivity")
            : t("item.noActivity")}
        </p>
      ) : null}
      <ol className="grid text-xs">
        {activity.map((entry) => {
          const change = activityChange(entry, labels)
          return (
            <li
              className="group relative flex gap-3 pb-4 last:pb-0"
              key={entry.id}
            >
              {/* Timeline rail between avatars; the last entry has none. */}
              <span
                aria-hidden
                className="absolute start-3 top-7 bottom-1 w-px bg-border group-last:hidden"
              />
              <ActivityActor actorNames={actorNames} entry={entry} />
              <div className="grid min-w-0 flex-1 gap-0.5 pt-0.5">
                <div className="flex items-baseline justify-between gap-2">
                  <ActivityActorName
                    actorNames={actorNames}
                    entry={entry}
                    failed={actorNamesFailed}
                  />
                  <time
                    className="shrink-0 text-[11px] text-muted-foreground tabular-nums"
                    dateTime={entry.occurredAt.toISOString()}
                    title={format.dateTime(entry.occurredAt, {
                      dateStyle: "full",
                      timeStyle: "medium",
                    })}
                  >
                    {format.dateTime(entry.occurredAt, {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </time>
                </div>
                <p className="break-words text-muted-foreground">
                  {t(activityKeys[entry.kind])}
                  {change ? (
                    <>
                      {": "}
                      <span>{change.from}</span>
                      {" → "}
                      <span className="font-medium text-foreground">
                        {change.to}
                      </span>
                    </>
                  ) : null}
                </p>
              </div>
            </li>
          )
        })}
      </ol>
      {hasMore ? (
        <Button
          className="justify-self-center"
          disabled={isLoadingMore}
          onClick={onLoadMore}
          size="sm"
          variant="ghost"
        >
          {isLoadingMore ? <Loader2Icon className="animate-spin" /> : null}
          {t("item.olderActivity")}
        </Button>
      ) : null}
    </section>
  )
}

/** The actor's name; a skeleton while member names load, "--" if they failed. */
function ActivityActorName({
  entry,
  actorNames,
  failed,
}: {
  entry: Activity
  actorNames: ReadonlyMap<string, string> | undefined
  failed: boolean
}) {
  const t = useTranslations("pipelines")
  if (entry.actorKind === "user" && !actorNames) {
    return failed ? (
      <span className="truncate font-medium">{UNKNOWN_MEMBER_LABEL}</span>
    ) : (
      <Skeleton className="h-3 w-20" />
    )
  }
  return (
    <span className="truncate font-medium">
      {activityActorLabel(entry, actorNames, t)}
    </span>
  )
}

/** A member's initials, or an icon for flows, triggers, API tokens and the system. */
function ActivityActor({
  entry,
  actorNames,
}: {
  entry: Activity
  actorNames: ReadonlyMap<string, string> | undefined
}) {
  if (entry.actorKind !== "user") {
    const { Icon } = AUTOMATION_ACTORS[entry.actorKind]
    return (
      <span
        aria-hidden
        className="relative flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"
      >
        <Icon className="size-3.5" />
      </span>
    )
  }
  const name = entry.actorUserId
    ? actorNames?.get(entry.actorUserId)
    : undefined
  return (
    <Avatar aria-hidden className="relative size-6 shrink-0">
      <AvatarFallback className="text-[10px]">
        {name ? initials(name) : null}
      </AvatarFallback>
    </Avatar>
  )
}
