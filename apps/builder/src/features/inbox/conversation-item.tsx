'use client'

import { Conversation } from "./interfaces/conversation";

import { useState, useEffect } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { formatDistanceToNow, parseISO, isAfter } from 'date-fns'
import { Users, CheckCircle, User } from "lucide-react";
import { Label } from "@/components/ui/label"

interface ConversationItemProps {
  conversation: Conversation
}

const MAX_MESSAGE_NUMBER = 30

export default function ConversationItem({ conversation }: ConversationItemProps) {
  const { lastActivityAt, contactLastSeenAt, contact, assignedType } = conversation;

  const [formattedTime, setFormattedTime] = useState<string>('');
  const [lastMessage, setLastMessage] = useState<string>(conversation.lastMessage);
  const [hasReadMessage, setHasReadMessage] = useState<boolean>(false);
  const [isSelected, setIsSelected] = useState<boolean>(false);

  const formatTimeAgo = (timestamp: string): string => {
    const result = formatDistanceToNow(parseISO(timestamp), { addSuffix: false })

    if (result === 'less than a minute') {
      return 'Less than 1 min';
    }

    if (result.includes('minute')) {
      return result.replace('minute', 'min').replace('minutes', 'min');
    }

    if (result.includes('hour')) {
      return result.replace('hour', 'hr').replace('hours', 'hrs');
    }

    if (result.includes('day')) {
      return result.replace('day', 'd').replace('days', 'd');
    }

    if (result.includes('week')) {
      return result.replace('week', 'wk').replace('weeks', 'wks');
    }

    return result;
  };

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

  const assignedIcon = () => {
    if (assignedType) {
      return (
        <div className="absolute flex items-center justify-center w-4 h-4 bg-gray-300 rounded-full bottom-0 left-0 right-0 m-auto -mb-1.5">
          {
            assignedType === 'Team' ? <Users size={10} color="black"/> : <User size={10} color="black"/>
          }
        </div>
      )
    }

    return null
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
        `flex items-center p-3 gap-4 rounded-xl relative
          ${isSelected ? 'bg-gray-200' : ''}
          hover:bg-gray-100 w-full cursor-pointer dark:hover:text-black`
      }
      onClick={() => setIsSelected(true)}
    >
      <div className="relative">
        <Avatar className="w-12 h-12">
          <AvatarImage src={avatar()} alt={username()}/>
          <AvatarFallback>{username().charAt(0)}</AvatarFallback>
        </Avatar>
        { assignedIcon() }
      </div>

      <div className="w-full">
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center space-x-2">
          <Label className="font-semibold truncate">{username()}</Label>
            { !hasReadMessage && <CheckCircle size={13} color="gray" /> }
          </div>
          <span className="text-gray-500 truncate">{formattedTime}</span>
        </div>
        <div className="mt-1 text-sm text-gray-600 w-full truncate">{lastMessage}</div>
      </div>

      {
        hasReadMessage && (
          <div className="absolute bottom-2.5 right-2.5">
            <Avatar className="w-3 h-3">
              <AvatarImage src={avatar()} alt={username()}/>
              <AvatarFallback>{username().charAt(0)}</AvatarFallback>
            </Avatar>
          </div>
        )
      }
    </div>
  )
}
