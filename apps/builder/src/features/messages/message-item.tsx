'use client'

import { Message } from "@/features/inbox/interfaces/message"
import { Files } from "lucide-react"
import Image from 'next/image'

interface MessageItemProps {
  message: Message
}

export default function MessageItem({ message }: MessageItemProps) {
  if (message.messageType === "text") {
    return message.content
  }

  if (typeof message.content === 'object') {
    const { imageUrl = '', audioUrl = '', videoUrl = '', fileUrl = '', fileName = '', location: { lat, lng } = {} } = message.content

    switch (message.messageType) {
      case 'image':
        return <div className="relative w-[150px] h-auto"><Image src={imageUrl} fill={true} alt={message.id} /></div>
      case 'audio':
        return <audio controls src={audioUrl} />
      case 'video':
        return <video controls className="rounded-b" width={300} height="auto" src={videoUrl} />
      case 'file':
        return (
          <a className="flex items-center gap-2" href={fileUrl} download>
            <Files size={15} /> {fileName}
          </a>
        )
      case "location":
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
