import { cn } from "@/components/lib/utils"
import { FileType, MessageType } from "@ahachat.ai/database/types"
import { format } from "date-fns"
import { PaperclipIcon } from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import type { MessageResource } from "../schemas/list-messages.schema"
import { MessageBubble } from "./message-bubble"

export const MessageItem = ({ message }: { message: MessageResource }) => {
  const variants: Record<MessageType, string> = {
    [MessageType.INCOMING]:
      "px-3 py-2 rounded-xl bg-secondary text-secondary-foreground",
    [MessageType.OUTGOING]:
      "px-3 py-2 rounded-xl bg-primary text-primary-foreground",
    [MessageType.ACTIVITY]: "text-center w-full text-muted-foreground",
  }
  return (
    <MessageBubble
      variant={message.messageType}
      title={format(new Date(message.createdAt), "yyyy/MM/dd HH:mm:ss")}
    >
      <div className="flex flex-col gap-1 max-w-[70%] mx-3">
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

const renderAttachments = ({
  message,
}: {
  message: MessageResource
}) => {
  return (
    <div>
      {(message.attachments ?? []).map((attachment) => {
        switch (attachment.fileType) {
          case FileType.IMAGE:
            return (
              <Image
                key={attachment.id}
                src={attachment.url}
                width={attachment.width || 0}
                height={attachment.height || 0}
                alt={attachment.name || "Attachment"}
              />
            )
          case FileType.VIDEO:
            return (
              <video
                width="320"
                height="240"
                controls
                preload="none"
                key={attachment.id}
              >
                <track default kind="captions" />
                <source src={attachment.url} type={attachment.mimeType} />
              </video>
            )
          case FileType.AUDIO:
            return (
              <audio controls preload="none" key={attachment.id}>
                <track default kind="captions" />
                <source src={attachment.url} type={attachment.mimeType} />
              </audio>
            )
          default:
            return (
              <div
                className="flex gap-2 px-3 py-2 rounded-xl bg-secondary items-center text-sm"
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
