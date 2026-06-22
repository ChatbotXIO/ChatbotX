"use client"

import { buildMessageLink } from "@chatbotx.io/business/utils"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@chatbotx.io/ui/components/ui/alert-dialog"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@chatbotx.io/ui/components/ui/popover"
import { Textarea } from "@chatbotx.io/ui/components/ui/textarea"
import { DirectUploadButton } from "@chatbotx.io/ui/components/uploader/direct-upload-button"
import { getMimeTypeFromFile } from "@chatbotx.io/ui/lib/file-types"
import { cn } from "@chatbotx.io/ui/lib/utils"
import {
  EllipsisVerticalIcon,
  ExternalLinkIcon,
  EyeOff,
  PaperclipIcon,
  PencilIcon,
  TrashIcon,
  XIcon,
} from "lucide-react"
import Image from "next/image"
import { useTranslations } from "next-intl"
import { useRef, useState } from "react"
import { useWorkspaceId } from "@/hooks/routing"
import { useChatStore } from "../../chat/store/chat-store-provider"
import type { MessageResourceWithRelations } from "../schema/resource"

type NewAttachment = {
  path: string
  publicUrl: string
  mimeType: string
  name: string
  size: number
}

type EditPayload = {
  id: string
  createdAt: Date
  text: string
  newAttachmentPath?: string
  newAttachmentPublicUrl?: string
  newAttachmentMimeType?: string
  newAttachmentName?: string
  newAttachmentSize?: number
  removeAttachment?: boolean
}

type MessageActionsEditorProps = {
  message: MessageResourceWithRelations
  onEdit: (payload: EditPayload) => void
  onEditingChange: (isEditing: boolean) => void
}

export const MessageActionsEditor = ({
  message,
  onEdit,
  onEditingChange,
}: MessageActionsEditorProps) => {
  const t = useTranslations()
  const workspaceId = useWorkspaceId()

  const messageText = message.text ?? ""
  const conversationId = message.conversationId
  const attachments = message.attachments ?? []

  const [editText, setEditText] = useState(messageText)
  const [removedAttachment, setRemovedAttachment] = useState(false)
  const [newAttachment, setNewAttachment] = useState<NewAttachment | null>(null)
  const imageReplaceTriggerRef = useRef<HTMLButtonElement | null>(null)

  const existingAttachment = attachments[0] ?? null
  const showExistingAttachment =
    existingAttachment !== null && !removedAttachment && newAttachment === null

  const handleSaveEdit = () => {
    const trimmed = editText.trim()
    if (trimmed.length === 0) {
      return
    }
    onEdit({
      id: message.id,
      createdAt: message.createdAt,
      text: trimmed,
      newAttachmentPath: newAttachment?.path,
      newAttachmentPublicUrl: newAttachment?.publicUrl,
      newAttachmentMimeType: newAttachment?.mimeType,
      newAttachmentName: newAttachment?.name,
      newAttachmentSize: newAttachment?.size,
      removeAttachment: removedAttachment && newAttachment === null,
    })
    onEditingChange(false)
  }

  const handleCancelEdit = () => {
    setEditText(messageText)
    setRemovedAttachment(false)
    setNewAttachment(null)
    onEditingChange(false)
  }

  const handleUploadSuccess = (
    filePath: string,
    file: File,
    publicUrl: string,
  ) => {
    const mimeType = getMimeTypeFromFile(file)
    setNewAttachment({
      path: filePath,
      publicUrl,
      mimeType,
      name: file.name,
      size: file.size,
    })
    setRemovedAttachment(false)
  }

  const uploadPath = `public/space/${workspaceId}/conversations/${conversationId}`

  return (
    <div className="mt-2 flex min-w-52 flex-col gap-2">
      <Textarea
        className="min-h-16 resize-none text-sm"
        onChange={(e) => setEditText(e.target.value)}
        placeholder={t("messages.editMessagePlaceholder")}
        value={editText}
      />

      {showExistingAttachment &&
        (existingAttachment.mimeType.startsWith("image/") &&
        existingAttachment.url ? (
          <div className="flex items-center gap-2 rounded-lg border p-2 text-sm">
            <div className="sr-only">
              <DirectUploadButton
                accept="image/*"
                onUploadSuccess={handleUploadSuccess}
                triggerRef={imageReplaceTriggerRef}
                uploadPath={uploadPath}
                workspaceId={workspaceId}
              />
            </div>
            <div className="relative flex-none">
              <button
                className="cursor-pointer"
                onClick={() => imageReplaceTriggerRef.current?.click()}
                type="button"
              >
                <Image
                  alt={existingAttachment.name ?? existingAttachment.originPath}
                  className="size-8 rounded object-cover"
                  height={32}
                  src={existingAttachment.url}
                  width={32}
                />
              </button>
              <Button
                className="absolute -top-1.5 -right-1.5 size-4 rounded-full p-0"
                onClick={() => setRemovedAttachment(true)}
                size="icon"
                type="button"
                variant="ghost"
              >
                <XIcon className="size-2.5" />
              </Button>
            </div>
            <span className="flex-1 truncate text-muted-foreground">
              {existingAttachment.name ?? existingAttachment.originPath}
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-lg border p-2 text-sm">
            <PaperclipIcon className="size-4 flex-none text-muted-foreground" />
            <span className="flex-1 truncate text-muted-foreground">
              {existingAttachment.name ?? existingAttachment.originPath}
            </span>
            <Button
              className="size-6"
              onClick={() => setRemovedAttachment(true)}
              size="icon"
              type="button"
              variant="ghost"
            >
              <XIcon className="size-3" />
            </Button>
            <DirectUploadButton
              accept="image/*"
              onUploadSuccess={handleUploadSuccess}
              uploadPath={uploadPath}
              workspaceId={workspaceId}
            >
              {t("messages.replaceAttachment")}
            </DirectUploadButton>
          </div>
        ))}

      {newAttachment !== null && (
        <div className="flex items-center gap-2 rounded-lg border p-2 text-sm">
          {newAttachment.mimeType.startsWith("image/") ? (
            <Image
              alt={newAttachment.name}
              className="size-8 rounded object-cover"
              height={32}
              src={newAttachment.publicUrl}
              width={32}
            />
          ) : (
            <PaperclipIcon className="size-4 flex-none text-muted-foreground" />
          )}
          <span className="flex-1 truncate text-muted-foreground">
            {newAttachment.name}
          </span>
          <Button
            className="size-6"
            onClick={() => setNewAttachment(null)}
            size="icon"
            type="button"
            variant="ghost"
          >
            <XIcon className="size-3" />
          </Button>
        </div>
      )}

      {!showExistingAttachment && newAttachment === null && (
        <DirectUploadButton
          accept="image/*"
          onUploadSuccess={handleUploadSuccess}
          uploadPath={uploadPath}
          workspaceId={workspaceId}
        >
          {t("messages.addAttachment")}
        </DirectUploadButton>
      )}

      <div className="flex gap-2">
        <Button
          disabled={!editText.trim()}
          onClick={handleSaveEdit}
          size="sm"
          type="button"
        >
          {t("messages.saveEdit")}
        </Button>
        <Button
          onClick={handleCancelEdit}
          size="sm"
          type="button"
          variant="ghost"
        >
          {t("messages.cancelEdit")}
        </Button>
      </div>
    </div>
  )
}

type MessageActionsProps = {
  message: MessageResourceWithRelations
  onChangeHide?: () => void
  onDelete?: () => void
  onEdit?: (payload: EditPayload) => void
  onEditingChange?: (isEditing: boolean) => void
}

export const MessageActions = ({
  message,
  onChangeHide,
  onDelete,
  onEdit,
  onEditingChange,
}: MessageActionsProps) => {
  const t = useTranslations()
  const [open, setOpen] = useState(false)

  const { conversations, activeConversationId } = useChatStore((state) => state)
  const activeConversation = conversations.find(
    (c) => c.id === activeConversationId,
  )
  const channel = activeConversation?.contactInboxes?.[0]?.channel

  const isDeleted = message.deletedAt != null
  const isOutgoing = message.messageType === "outgoing"
  const attributes = message.attributes as {
    liked?: boolean
    hidden?: boolean
  } | null
  const isHidden = attributes?.hidden === true
  const messageLink =
    channel && message.sourceId
      ? buildMessageLink(
          channel as Parameters<typeof buildMessageLink>[0],
          message.sourceId,
        )
      : null

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger asChild>
        <Button
          className="self-center opacity-0 transition-opacity group-hover:opacity-100"
          size="icon"
          type="button"
          variant="ghost"
        >
          <EllipsisVerticalIcon className="size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="flex w-auto flex-col gap-0.5 p-1" side="top">
        {messageLink && (
          <Button
            asChild
            className="justify-start"
            size="sm"
            type="button"
            variant="ghost"
          >
            <a href={messageLink} rel="noopener noreferrer" target="_blank">
              <ExternalLinkIcon className="size-4" />
              {t("messages.viewMessage")}
            </a>
          </Button>
        )}

        {!isOutgoing && (
          <Button
            className="justify-start"
            disabled={isDeleted}
            onClick={() => {
              onChangeHide?.()
              setOpen(false)
            }}
            size="sm"
            type="button"
            variant="ghost"
          >
            <EyeOff className={cn("size-3", isHidden && "fill-current")} />
            {t("messages.changeHideState")}
          </Button>
        )}

        {onEdit && isOutgoing && (
          <Button
            className="justify-start"
            disabled={isDeleted}
            onClick={() => {
              onEditingChange?.(true)
              setOpen(false)
            }}
            size="sm"
            type="button"
            variant="ghost"
          >
            <PencilIcon className="size-3" />
            {t("actions.edit")}
          </Button>
        )}

        {onDelete && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                className="justify-start text-destructive hover:text-destructive"
                disabled={isDeleted}
                size="sm"
                type="button"
                variant="ghost"
              >
                <TrashIcon className="size-3" />
                {t("actions.delete")}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {t("messages.deleteComment")}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {t("messages.deleteCommentConfirmation")}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t("actions.cancel")}</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => {
                    onDelete()
                    setOpen(false)
                  }}
                >
                  {t("actions.confirm")}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </PopoverContent>
    </Popover>
  )
}
