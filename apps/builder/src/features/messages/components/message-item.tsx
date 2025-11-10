import { FileType, MessageType } from "@aha.chat/database/types"
import { cn } from "@aha.chat/ui/lib/utils"
import { format } from "date-fns"
import { PaperclipIcon } from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import type { MessageResource } from "../schemas"
import { MessageBubble } from "./message-bubble"

type MessageItemProps = {
  message: MessageResource
  guestDisplay?: boolean
}

export const MessageItem = (props: MessageItemProps) => {
  const { message, guestDisplay = false } = props

  const variants: Record<"left" | "right" | "full", string> = {
    left: "px-4 py-3 rounded-xl bg-secondary text-secondary-foreground",
    right: "px-4 py-3 rounded-xl bg-primary text-primary-foreground",
    full: "text-center w-full text-muted-foreground",
  }

  let variant: "left" | "right" | "full" = "full"
  switch (message.messageType) {
    case MessageType.incoming:
      variant = guestDisplay ? "right" : "left"
      break
    case MessageType.outgoing:
      variant = guestDisplay ? "left" : "right"
      break
    default:
      variant = "full"
      break
  }

  return (
    <MessageBubble
      title={format(new Date(message.createdAt), "yyyy/MM/dd HH:mm:ss")}
      variant={variant}
    >
      <div className="mx-3 flex max-w-[70%] flex-col gap-1">
        {message.content && message.content.length > 0 && (
          <div className={cn("text-sm", variants[variant])}>
            <pre className="whitespace-pre-line break-all font-sans">
              {message.content}
            </pre>
          </div>
        )}
        {message.attachments &&
          message.attachments.length > 0 &&
          renderAttachments({ message })}
      </div>
    </MessageBubble>
  )
}

const renderAttachments = (props: { message: MessageResource }) => {
  const { message } = props

  return (
    <div>
      {(message.attachments ?? []).map((attachment) => {
        switch (attachment.fileType) {
          case FileType.image:
            return (
              <Image
                alt={attachment.name || "Attachment"}
                height={attachment.height || 0}
                key={attachment.id}
                src={attachment.url}
                width={attachment.width || 0}
              />
            )
          case FileType.video:
            return (
              <video
                controls
                height="240"
                key={attachment.id}
                preload="none"
                width="320"
              >
                <track default kind="captions" />
                <source src={attachment.url} type={attachment.mimeType} />
              </video>
            )
          case FileType.audio:
            return (
              <audio controls key={attachment.id} preload="none">
                <track default kind="captions" />
                <source src={attachment.url} type={attachment.mimeType} />
              </audio>
            )
          default:
            return (
              <div
                className="flex items-center gap-2 rounded-xl bg-secondary px-3 py-2 text-sm"
                key={attachment.id}
              >
                <PaperclipIcon size={16} />
                <Link href={attachment.url ?? "/#"}>{attachment.name}</Link>
              </div>
            )
        }
      })}
    </div>
  )
}
