'use client'

import * as React from "react";
import {Avatar, AvatarFallback, AvatarImage} from "@/components/ui/avatar"
import { formatDistanceToNow } from 'date-fns'
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"

interface ConversationItemProps {
  avatarUrl: string;
  username: string;
  isOnline: boolean;
  lastMessageTime: number;
  lastMessage: string;
}

export default function InboxConversationItem({ avatarUrl, username, isOnline, lastMessageTime, lastMessage }: ConversationItemProps) {
  const formatLastMessage = () => lastMessage.length > 30 ? `${lastMessage.substring(0, 30)}...` : lastMessage

  return (
    <div className="flex items-center p-4 gap-4 border-b border-gray-200 hover:bg-gray-50 w-full cursor-pointer">
      <Avatar className="w-12 h-12">
        <AvatarImage src={avatarUrl} alt={username}/>
        <AvatarFallback>{username.charAt(0)}</AvatarFallback>
      </Avatar>

      <div className="w-full">
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center space-x-2">
            <Label className="font-semibold truncate">{username}</Label>
            <span className={`w-2.5 h-2.5 rounded-full ${isOnline ? 'bg-green-500' : 'bg-gray-500'}`}></span>
          </div>
          <span className="text-gray-500">{formatDistanceToNow(lastMessageTime)}</span>
        </div>
        <div className="mt-1 text-sm text-gray-600 w-full">
          {formatLastMessage()}
        </div>
        <div className="flex gap-2 mt-4">
          <Badge>VIP</Badge>
          <Badge variant="outline">New</Badge>
        </div>
      </div>
    </div>
  )
}
