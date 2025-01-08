'use client'

import { MessageType } from "@ahachat.ai/database"
import { Files } from "lucide-react"
import Image from 'next/image'
import { MessageResource } from "@/features/messages/schemas/get-messages-schema";

interface MessageItemProps {
  message: MessageResource
}

export default function MessageItem({ message }: MessageItemProps) {
  if (message.messageType === MessageType.Text) {
    return message.content
  }

  const content = JSON.parse(message.content ?? '{}')
  if (typeof content === 'object') {
    const { imageUrl = '', audioUrl = '', videoUrl = '', fileUrl = '', fileName = '', location: { lat = "", lng = "" } = {} } = content

    switch (message.messageType) {
      case MessageType.Image:
        return <div className="relative w-[150px] h-auto"><Image src={imageUrl} fill={true} alt={message.id} /></div>
      case MessageType.Audio:
        return <audio controls src={audioUrl} />
      case MessageType.Video:
        return <video controls className="rounded-b" width={300} height="auto" src={videoUrl} />
      case MessageType.File:
        return (
          <a className="flex items-center gap-2" href={fileUrl} download>
            <Files size={15} /> {fileName}
          </a>
        )
      case MessageType.Location:
        return (
          <iframe
            width="100%"
            height="150"
            src={`https://maps.google.com/maps?q=${lat},${lng}&z=15&output=embed`}
            allowFullScreen
            title="location"
          ></iframe>
        )
      default:
        return <div>default message</div>
    }
  }
}
