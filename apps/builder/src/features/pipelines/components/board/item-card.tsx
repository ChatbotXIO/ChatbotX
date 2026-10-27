"use client"

import type { PipelineSettings } from "@chatbotx.io/database/partials"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@chatbotx.io/ui/components/ui/dropdown-menu"
import { useDraggable } from "@dnd-kit/core"
import {
  ArrowRightLeftIcon,
  CalendarIcon,
  ClockIcon,
  FlagIcon,
  HistoryIcon,
  MessageSquareIcon,
  MoreVerticalIcon,
  MoveRightIcon,
  Trash2Icon,
} from "lucide-react"
import { useFormatter, useLocale, useTranslations } from "next-intl"
import { memo, type ReactNode } from "react"
import { ContactAvatar } from "@/features/contacts/components/contact-avatar"
import { contactDisplayName } from "@/features/contacts/lib/contact-display-name"
import { formatItemAge, formatItemValue } from "../../lib/format-item-value"
import { priorityFlagClass } from "../../lib/item-noun"
import { isItemOverdue } from "../../lib/item-overdue"
import type { AssigneeOption } from "../../lib/use-assignee-options"
import { AssigneeAvatars } from "../shared/assignee-combobox"
import type { BoardItemView } from "./types"

/** What the card menu needs; omitted on the drag overlay, which has no menu. */
export type ItemCardActions = {
  workspaceId: string
  pipelineId: string
  /** Stages a card can move to; stages running a bulk job are excluded. */
  stages: { id: string; name: string }[]
  canMove: boolean
  canDelete: boolean
  onMove: (itemId: string, stageId: string) => void
  /** Opens the board's single transfer/delete dialog for this card. */
  onDialog: (kind: "transfer" | "delete", itemId: string) => void
}

type ItemCardProps = {
  view: BoardItemView
  currency: string
  elements: PipelineSettings["cardElements"]
  onOpen: (itemId: string) => void
  assigneeNames: Map<string, string>
  actions?: ItemCardActions
  isOverlay?: boolean
  canDrag?: boolean
}

// The menu popup is portaled but still bubbles React events to the draggable wrapper.
const stopDrag = {
  onPointerDown: (event: { stopPropagation: () => void }) =>
    event.stopPropagation(),
  onKeyDown: (event: { stopPropagation: () => void }) =>
    event.stopPropagation(),
}

export const ItemCard = memo(function ItemCard({
  view,
  currency,
  elements,
  onOpen,
  assigneeNames,
  actions,
  isOverlay,
  canDrag = true,
}: ItemCardProps) {
  const locale = useLocale()
  const format = useFormatter()
  const t = useTranslations("pipelines")
  const { item, contact } = view
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: item.id,
    data: { stageId: item.stageId },
    disabled: isOverlay || !canDrag,
  })
  // The card holds real buttons, so the wrapper must not also be a button/tab stop.
  const { role: _role, tabIndex: _tabIndex, ...dragAttributes } = attributes
  const { workspaceMemberIds: memberIds, inboxTeamIds: teamIds } =
    view.assignees
  const assigneeOptions: AssigneeOption[] = [
    ...memberIds.map((id) => ({
      id,
      label: assigneeNames.get(id) ?? "--",
      kind: "member" as const,
    })),
    ...teamIds.map((id) => ({
      id,
      label: assigneeNames.get(id) ?? "--",
      kind: "team" as const,
    })),
  ]
  const contactName = contactDisplayName(contact) ?? t("board.unknownContact")
  const showMenu =
    actions && !isOverlay && (actions.canMove || actions.canDelete)
  const otherStages = actions?.stages.filter(
    (stage) => stage.id !== item.stageId,
  )

  return (
    <div
      className={`flex cursor-grab touch-none flex-col rounded-lg border bg-card text-left text-sm shadow-xs transition-[box-shadow,border-color] hover:border-ring/40 hover:shadow-md active:cursor-grabbing ${
        isDragging ? "opacity-40" : ""
      } ${isOverlay ? "w-[274px] shadow-lg" : ""}`}
      data-testid="pipeline-item-card"
      ref={setNodeRef}
      {...dragAttributes}
      {...listeners}
    >
      <div className="flex items-start gap-1 p-3">
        <button
          className="flex min-w-0 flex-1 items-center gap-2 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => onOpen(item.id)}
          // Enter/Space must open the item, not start a keyboard drag on the wrapper.
          onKeyDown={(event) => event.stopPropagation()}
          type="button"
        >
          <ContactAvatar contact={contact} name={contactName} />
          <span className="flex min-w-0 flex-col">
            <span className="truncate font-medium text-sm">{contactName}</span>
            {elements.contactPhone && contact?.phoneNumber ? (
              <span className="truncate text-muted-foreground text-xs">
                {contact.phoneNumber}
              </span>
            ) : null}
            {elements.contactEmail && contact?.email ? (
              <span className="truncate text-muted-foreground text-xs">
                {contact.email}
              </span>
            ) : null}
          </span>
        </button>
        {showMenu ? (
          <CardMenu
            actions={actions}
            itemId={item.id}
            onDialog={(kind) => actions.onDialog(kind, item.id)}
            otherStages={otherStages ?? []}
          />
        ) : null}
      </div>
      <button
        className="flex flex-col gap-1.5 border-t px-3 py-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={() => onOpen(item.id)}
        onKeyDown={(event) => event.stopPropagation()}
        type="button"
      >
        <span className="line-clamp-2 break-words font-medium text-sm">
          {item.title}
        </span>
        {elements.cardId || elements.value ? (
          // Number left, value right; an item without a value shows 0.
          <span className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground text-xs">
              {elements.cardId ? `#${item.number}` : null}
            </span>
            {elements.value ? (
              <span className="shrink-0 font-semibold text-sm tabular-nums">
                {formatItemValue(item.value ?? 0, currency, locale)}
              </span>
            ) : null}
          </span>
        ) : null}
      </button>
      <div className="flex items-start gap-3 border-t px-3 py-2.5 text-muted-foreground text-xs">
        {/* Stats wrap among themselves; the priority flag stays pinned top-right. */}
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1.5">
          {elements.assignees && assigneeOptions.length > 0 ? (
            <AssigneeAvatars
              compact
              options={assigneeOptions}
              value={{ memberIds, teamIds }}
            />
          ) : null}
          {elements.createdAt ? (
            <FooterStat
              icon={<ClockIcon className="size-3.5" />}
              title={t("settings.card.createdAt")}
            >
              {formatItemAge(item.createdAt, locale)}
            </FooterStat>
          ) : null}
          {elements.updatedAt ? (
            <FooterStat
              icon={<HistoryIcon className="size-3.5" />}
              title={t("settings.card.updatedAt")}
            >
              {formatItemAge(item.updatedAt, locale)}
            </FooterStat>
          ) : null}
          {elements.dueDate && item.dueDate ? (
            <FooterStat
              className={isItemOverdue(item) ? "text-destructive" : undefined}
              icon={<CalendarIcon className="size-3.5" />}
              title={t("settings.card.dueDate")}
            >
              {format.dateTime(item.dueDate, {
                month: "short",
                day: "numeric",
              })}
            </FooterStat>
          ) : null}
          {elements.comments ? (
            <FooterStat
              icon={<MessageSquareIcon className="size-3.5" />}
              title={t("settings.card.comments")}
            >
              {view.commentCount}
            </FooterStat>
          ) : null}
        </div>
        {elements.priority ? (
          <FlagIcon
            aria-hidden
            className={`mt-0.5 size-3.5 shrink-0 ${priorityFlagClass[item.priority]}`}
            fill="currentColor"
          />
        ) : null}
      </div>
    </div>
  )
})

function FooterStat({
  icon,
  title,
  className,
  children,
}: {
  icon: ReactNode
  title: string
  className?: string
  children: ReactNode
}) {
  return (
    <span
      className={`flex shrink-0 items-center gap-1 whitespace-nowrap tabular-nums ${className ?? ""}`}
      title={title}
    >
      {icon}
      {children}
    </span>
  )
}

function CardMenu({
  actions,
  itemId,
  otherStages,
  onDialog,
}: {
  actions: ItemCardActions
  itemId: string
  otherStages: { id: string; name: string }[]
  onDialog: (dialog: "transfer" | "delete") => void
}) {
  const t = useTranslations("pipelines")
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            aria-label={t("board.cardMenu")}
            className="size-7 shrink-0"
            size="icon"
            variant="ghost"
            {...stopDrag}
          >
            <MoreVerticalIcon />
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-48" {...stopDrag}>
        {actions.canMove ? (
          <>
            {otherStages.length > 0 ? (
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <MoveRightIcon />
                  {t("board.moveTo")}
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="w-48" {...stopDrag}>
                  {otherStages.map((stage) => (
                    <DropdownMenuItem
                      key={stage.id}
                      onClick={() => actions.onMove(itemId, stage.id)}
                    >
                      <span className="truncate">{stage.name}</span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            ) : null}
            <DropdownMenuItem onClick={() => onDialog("transfer")}>
              <ArrowRightLeftIcon />
              {t("item.transfer")}
            </DropdownMenuItem>
          </>
        ) : null}
        {actions.canMove && actions.canDelete ? (
          <DropdownMenuSeparator />
        ) : null}
        {actions.canDelete ? (
          <DropdownMenuItem
            onClick={() => onDialog("delete")}
            variant="destructive"
          >
            <Trash2Icon />
            {t("item.delete")}
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
