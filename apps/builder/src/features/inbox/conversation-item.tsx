'use client'

import { Conversation } from "./interfaces/conversation";

import { useState, useEffect } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { formatDistanceToNow, parseISO, isAfter } from 'date-fns'
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"

interface ConversationItemProps {
  conversation: Conversation
}

const MAX_MESSAGE_NUMBER = 30

export default function ConversationItem({ conversation }: ConversationItemProps) {
  const { lastActivityAt, contactLastSeenAt, contact } = conversation;

  const [formattedTime, setFormattedTime] = useState<string>('');
  const [lastMessage, setLastMessage] = useState<string>(conversation.lastMessage);
  const [hasReadMessage, setHasReadMessage] = useState<boolean>(false);
  const [isSelected, setIsSelected] = useState<boolean>(false);

  const formatTimeAgo = (timestamp: string): string => formatDistanceToNow(parseISO(timestamp), { addSuffix: true });

  const formatLastMessage = (message: string): string => message.length > MAX_MESSAGE_NUMBER ? `${message.substring(0, MAX_MESSAGE_NUMBER)}...` : message

  const username = (): string => {
    const { firstName, lastName, phoneNumber } = contact

    if (firstName || lastName) {
      return `${firstName} ${lastName}`
    }

    return `${phoneNumber}`
  }

  const avatar = (): string => {
    const { avatar = '' } = contact
    return `${avatar}`
  }

  const compareTime = (): boolean => {
    const lastActivityDate = parseISO(lastActivityAt);
    const contactLastSeenDate = parseISO(contactLastSeenAt);
    return isAfter(lastActivityDate, contactLastSeenDate);
  }

  useEffect(() => {
    const formatted = formatTimeAgo(lastActivityAt);
    setFormattedTime(formatted);
    setHasReadMessage(compareTime());
  }, [lastActivityAt, contactLastSeenAt]);

  useEffect(() => {
    setLastMessage(formatLastMessage(conversation.lastMessage))
  }, [conversation.lastMessage])


  return (
    <div
      className={
        `flex items-center p-3 gap-4 rounded-xl
          ${isSelected ? 'bg-gray-50' : ''}
          hover:bg-gray-50 w-full cursor-pointer`
      }
      onClick={() => setIsSelected(true)}
    >
      <Avatar className="w-12 h-12">
        <AvatarImage src={avatar()} alt={username()}/>
        <AvatarFallback>{username().charAt(0)}</AvatarFallback>
      </Avatar>

      <div className="w-full">
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center space-x-2">
            <Label className="font-semibold truncate">{username()}</Label>
            <span className={`w-2.5 h-2.5 rounded-full ${hasReadMessage ? 'bg-green-500' : 'bg-gray-500'}`}></span>
          </div>
          <span className="text-gray-500">{formattedTime}</span>
        </div>
        <div className="mt-1 text-sm text-gray-600 w-full">{lastMessage}</div>
        <div className="flex gap-2 mt-4">
          <Badge>VIP</Badge>
          <Badge variant="outline">New</Badge>
        </div>
      </div>
    </div>
  )
}
