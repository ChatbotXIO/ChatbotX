import { FileType, MessageType } from "@aha.chat/database/types"
import { cn } from "@aha.chat/ui/lib/utils"
import { format } from "date-fns"
import { PaperclipIcon } from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import type { MessageResource } from "../schemas"
import { MessageBubble } from "./message-bubble"

export const MessageItem = (props: { message: MessageResource }) => {
  const { message } = props

  const variants: Record<MessageType, string> = {
    [MessageType.INCOMING]:
      "px-3 py-2 rounded-xl bg-secondary text-secondary-foreground",
    [MessageType.OUTGOING]:
      "px-3 py-2 rounded-xl bg-primary text-primary-foreground",
    [MessageType.ACTIVITY]: "text-center w-full text-muted-foreground",
  }
  return (
    <MessageBubble
      title={format(new Date(message.createdAt), "yyyy/MM/dd HH:mm:ss")}
      variant={message.messageType}
    >
      <div className="mx-3 flex max-w-[70%] flex-col gap-1">
        {message.content && message.content.length > 0 && (
          <div className={cn("text-sm", variants[message.messageType])}>
            <pre className="whitespace-normal break-all font-sans">
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
          case FileType.IMAGE:
            return (
              <Image
                alt={attachment.name || "Attachment"}
                height={attachment.height || 0}
                key={attachment.id}
                src={attachment.url}
                width={attachment.width || 0}
              />
            )
          case FileType.VIDEO:
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
          case FileType.AUDIO:
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
