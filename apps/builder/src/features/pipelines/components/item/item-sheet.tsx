"use client"

import type { PipelineActivityGroup } from "@chatbotx.io/database/partials"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@chatbotx.io/ui/components/ui/dropdown-menu"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@chatbotx.io/ui/components/ui/sheet"
import { Skeleton } from "@chatbotx.io/ui/components/ui/skeleton"
import { useInfiniteQuery, useQuery } from "@tanstack/react-query"
import {
  AlignLeftIcon,
  ArrowLeftIcon,
  ArrowRightLeftIcon,
  InboxIcon,
  MoreHorizontalIcon,
  MoveRightIcon,
  Trash2Icon,
} from "lucide-react"
import dynamic from "next/dynamic"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useCallback, useState } from "react"
import { ContactAvatar } from "@/features/contacts/components/contact-avatar"
import { contactDisplayName } from "@/features/contacts/lib/contact-display-name"
import { withFieldValuesTimezone } from "@/features/custom-fields/lib/field-date"
import {
  useWorkspaceMembers,
  workspaceMemberLabel,
} from "@/features/users/provider/user-hook"
import { orpc } from "@/lib/orpc/query"
import { moveItemAction, updateItemAction } from "../../actions/item.action"
import type { ItemPatch } from "../../lib/item-patch"
import { moveTargetStages } from "../../lib/move-targets"
import { useAssigneeOptions } from "../../lib/use-assignee-options"
import { usePipelineAction } from "../../lib/use-pipeline-action"
import type { BoardColumn, BoardField, BoardPipeline } from "../board/types"
import { InlineEdit } from "./inline-edit"
import { DeleteItemDialog, TransferDialog } from "./item-dialogs"
import { ItemFields } from "./item-fields"
import {
  ActivitySection,
  AttachmentsSection,
  CommentsSection,
} from "./item-sections"

type ItemSheetProps = {
  workspaceId: string
  pipeline: Pick<BoardPipeline, "id" | "name" | "currency" | "settings">
  columns: BoardColumn[]
  fields: Pick<BoardField, "id" | "name" | "type" | "required">[]
  itemId: string | null
  canEdit: boolean
  canDelete: boolean
  onClose: () => void
}

// The inbox chat is heavy; load it only when an agent opens it on an item.
const ItemConversation = dynamic(
  () => import("./item-conversation").then((mod) => mod.ItemConversation),
  { ssr: false },
)

export function ItemSheet({
  workspaceId,
  pipeline,
  columns,
  fields,
  itemId,
  canEdit,
  canDelete,
  onClose,
}: ItemSheetProps) {
  const t = useTranslations("pipelines")
  const tc = useTranslations("actions")
  // Which item's conversation is open beside it; another item starts closed.
  const [chatItemId, setChatItemId] = useState<string | null>(null)
  const isChatOpen = chatItemId !== null && chatItemId === itemId
  const closeChat = useCallback(() => setChatItemId(null), [])
  const assignees = useAssigneeOptions(workspaceId)
  const members = useWorkspaceMembers(workspaceId)
  const [dialog, setDialog] = useState<"transfer" | "delete" | null>(null)
  const input = { workspaceId, pipelineId: pipeline.id, itemId: itemId ?? "" }
  const enabled = Boolean(itemId)

  const detail = useQuery(
    orpc.pipelinesAPI.privateGetItemAPI.queryOptions({ input, enabled }),
  )
  const comments = useInfiniteQuery(
    orpc.pipelinesAPI.privateListItemCommentsAPI.infiniteOptions({
      input: (cursor: string | undefined) => ({ ...input, cursor }),
      initialPageParam: undefined,
      getNextPageParam: (page) => page.nextCursor ?? undefined,
      enabled,
    }),
  )
  const [activityGroups, setActivityGroups] = useState<PipelineActivityGroup[]>(
    [],
  )
  const activity = useInfiniteQuery(
    orpc.pipelinesAPI.privateListItemActivityAPI.infiniteOptions({
      // The filter is part of the input, so each filter is its own cached list.
      input: (cursor: string | undefined) => ({
        ...input,
        cursor,
        groups: activityGroups.length > 0 ? activityGroups : undefined,
      }),
      initialPageParam: undefined,
      getNextPageParam: (page) => page.nextCursor ?? undefined,
      enabled,
    }),
  )

  const update = useAction(
    updateItemAction.bind(null, workspaceId),
    usePipelineAction({
      mayAssignContact: pipeline.settings.assignContactOnAssign,
    }),
  )

  const move = useAction(
    moveItemAction.bind(null, workspaceId),
    usePipelineAction({ errorMessage: "board.moveFailed" }),
  )
  const save = (patch: ItemPatch) => {
    if (!itemId) {
      return
    }
    update.execute({
      id: pipeline.id,
      itemId,
      ...withFieldValuesTimezone(patch),
    })
  }

  const view = detail.data
  const item = view?.item
  // A failed refetch means the item was deleted or moved away: nothing on it
  // (fields, menu, open dialogs) may stay actionable.
  const isAvailable = Boolean(item) && !detail.isError
  // Stages running a bulk job accept no new items, as on the board card menu.
  const moveTargets = moveTargetStages(columns, item?.stageId)
  const contactName =
    contactDisplayName(view?.contact) ?? t("board.unknownContact")
  const conversationId = view?.conversationId
  // Without a conversation there is nothing to chat in; the contacts page is the way in.
  const contactsHref = `/space/${workspaceId}/contacts`
  // Every member is listed (unnamed ones as the shared "--" label), so an
  // active member is never read as a former one.
  const memberNames = new Map(
    (members.data ?? []).flatMap((member) =>
      member.user?.id
        ? [[member.user.id, workspaceMemberLabel(member)] as const]
        : [],
    ),
  )
  const creatorName = item?.createdById
    ? (memberNames.get(item.createdById) ?? null)
    : null
  const closeDialog = () => setDialog(null)
  const closeAll = () => {
    closeDialog()
    onClose()
  }
  const sectionContext = {
    workspaceId,
    pipelineId: pipeline.id,
    itemId: item?.id ?? "",
    canEdit,
  }

  return (
    <Sheet onOpenChange={(open) => !open && onClose()} open={enabled}>
      <SheetContent
        className={
          isChatOpen && conversationId
            ? "w-full flex-row gap-0 sm:max-w-[min(100vw,100rem)]"
            : "w-full sm:max-w-2xl"
        }
      >
        <div
          className={
            isChatOpen && conversationId
              ? "hidden min-h-0 w-full max-w-xl shrink-0 flex-col gap-4 lg:flex"
              : "contents"
          }
        >
          <SheetHeader className="flex-row items-center gap-2 border-b p-3 pe-12">
            <Button
              aria-label={tc("back")}
              onClick={onClose}
              size="icon"
              variant="ghost"
            >
              <ArrowLeftIcon />
            </Button>
            <div className="min-w-0 flex-1">
              <SheetTitle className="truncate">
                {item?.title ?? t("item.loading")}
              </SheetTitle>
              <SheetDescription className="sr-only">
                {item ? `#${item.number}` : t("item.loading")}
              </SheetDescription>
            </div>
            {(canEdit || canDelete) && isAvailable ? (
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      aria-label={t("item.moreActions")}
                      size="icon"
                      variant="ghost"
                    >
                      <MoreHorizontalIcon />
                    </Button>
                  }
                />
                <DropdownMenuContent align="end" className="w-48">
                  {canEdit && moveTargets.length > 0 ? (
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger>
                        <MoveRightIcon />
                        {t("board.moveTo")}
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent className="w-48">
                        {moveTargets.map(({ stage }) => (
                          <DropdownMenuItem
                            disabled={move.isPending}
                            key={stage.id}
                            onClick={() =>
                              move.execute({
                                id: pipeline.id,
                                itemId: item?.id ?? "",
                                stageId: stage.id,
                              })
                            }
                          >
                            <span className="truncate">{stage.name}</span>
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                  ) : null}
                  {canEdit ? (
                    <DropdownMenuItem onClick={() => setDialog("transfer")}>
                      <ArrowRightLeftIcon />
                      {t("item.transfer")}
                    </DropdownMenuItem>
                  ) : null}
                  {canDelete ? (
                    <DropdownMenuItem
                      onClick={() => setDialog("delete")}
                      variant="destructive"
                    >
                      <Trash2Icon />
                      {t("item.delete")}
                    </DropdownMenuItem>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </SheetHeader>

          {detail.isPending ? (
            <div className="grid gap-3 px-4" data-testid="item-loading">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-40 w-full" />
            </div>
          ) : null}

          {detail.isError ? (
            <div className="flex flex-col items-center gap-3 p-6 text-center">
              <p className="text-muted-foreground text-sm">{t("item.error")}</p>
              <Button
                onClick={() => detail.refetch()}
                size="sm"
                variant="outline"
              >
                {t("retry")}
              </Button>
            </div>
          ) : null}

          {/* After a failed refetch (the item was deleted or transferred), the
            cached item must not stay on screen as if it were still editable. */}
          {view && item && isAvailable ? (
            <div className="grid min-h-0 flex-1 gap-5 overflow-y-auto px-5 pb-8 text-sm">
              <div className="flex items-center gap-3 rounded-lg border bg-muted/30 p-3">
                <ContactAvatar
                  className="size-9"
                  contact={view.contact}
                  name={contactName}
                />
                <span className="min-w-0 flex-1 truncate font-medium">
                  {contactName}
                </span>
                {view.contact && conversationId ? (
                  <Button
                    aria-pressed={isChatOpen}
                    onClick={() => setChatItemId(isChatOpen ? null : item.id)}
                    size="sm"
                    variant={isChatOpen ? "secondary" : "outline"}
                  >
                    <InboxIcon />
                    {t("item.inbox")}
                  </Button>
                ) : null}
                {view.contact && !conversationId ? (
                  <Button
                    nativeButton={false}
                    render={<Link href={contactsHref} prefetch={false} />}
                    size="sm"
                    variant="outline"
                  >
                    <InboxIcon />
                    {t("item.inbox")}
                  </Button>
                ) : null}
              </div>

              <InlineEdit
                canEdit={canEdit}
                label={t("item.title")}
                maxLength={200}
                onSave={(title) => save({ title })}
                required
                value={item.title}
              >
                <h2 className="break-words font-semibold text-xl leading-tight">
                  {item.title}
                </h2>
              </InlineEdit>

              <ItemFields
                assigneeOptions={assignees}
                assignees={view.assignees}
                assigneesLocked={update.isPending || detail.isFetching}
                canEdit={canEdit}
                columns={columns}
                creatorName={creatorName}
                fields={fields}
                item={item}
                onSave={save}
                pipeline={pipeline}
              />

              <section className="grid gap-3 border-t pt-5">
                <h3 className="flex items-center gap-2 font-medium text-sm">
                  <AlignLeftIcon className="size-4 text-muted-foreground" />
                  {t("item.description")}
                </h3>
                <InlineEdit
                  canEdit={canEdit}
                  label={t("item.description")}
                  maxLength={5000}
                  multiline
                  onSave={(description) =>
                    save({ description: description || null })
                  }
                  value={item.description ?? ""}
                >
                  {item.description ? (
                    <p className="whitespace-pre-wrap break-words">
                      {item.description}
                    </p>
                  ) : (
                    <p className="text-muted-foreground">
                      {t("item.noDescription")}
                    </p>
                  )}
                </InlineEdit>
              </section>

              <AttachmentsSection
                attachments={view.attachments}
                canDelete={canEdit}
                context={sectionContext}
              />
              {comments.isError || activity.isError ? (
                <div className="flex items-center justify-between gap-3 rounded-md border border-destructive/40 p-3">
                  <p className="text-destructive text-xs">{t("item.error")}</p>
                  <Button
                    onClick={() => {
                      comments.refetch()
                      activity.refetch()
                    }}
                    size="sm"
                    variant="outline"
                  >
                    {t("retry")}
                  </Button>
                </div>
              ) : null}
              <CommentsSection
                authorNames={memberNames}
                canDelete={canEdit}
                comments={comments.data?.pages.flatMap((page) => page.items)}
                context={sectionContext}
                hasMore={comments.hasNextPage}
                isLoadingMore={comments.isFetchingNextPage}
                onLoadMore={() => comments.fetchNextPage()}
                total={view.commentCount}
              />
              <ActivitySection
                activity={
                  activity.data?.pages.flatMap((page) => page.items) ?? []
                }
                actorNames={members.data ? memberNames : undefined}
                actorNamesFailed={members.isError}
                currency={pipeline.currency}
                groups={activityGroups}
                hasMore={activity.hasNextPage}
                isLoading={activity.isPending}
                isLoadingMore={activity.isFetchingNextPage}
                onGroupsChange={setActivityGroups}
                onLoadMore={() => activity.fetchNextPage()}
                statusLabels={pipeline.settings.statusLabels}
              />
            </div>
          ) : null}
        </div>

        {isChatOpen && conversationId ? (
          <ItemConversation
            conversationId={conversationId}
            onBack={closeChat}
            workspaceId={workspaceId}
          />
        ) : null}

        {itemId && dialog === "transfer" ? (
          <TransferDialog
            disabled={!isAvailable}
            itemId={itemId}
            onClose={closeDialog}
            onDone={closeAll}
            pipelineId={pipeline.id}
            workspaceId={workspaceId}
          />
        ) : null}
        {itemId && dialog === "delete" ? (
          <DeleteItemDialog
            disabled={!isAvailable}
            itemId={itemId}
            onClose={closeDialog}
            onDone={closeAll}
            pipelineId={pipeline.id}
            workspaceId={workspaceId}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  )
}
