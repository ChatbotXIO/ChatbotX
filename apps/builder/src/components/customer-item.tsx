"use client"

import * as React from "react";
import {Avatar, AvatarFallback, AvatarImage} from "@/components/ui/avatar";
import { formatDistanceToNow } from "date-fns";

interface CustomerProps {
  customer: Record<string, any>
}

const CustomerItem: React.FC<CustomerProps> = ({ customer }) => {
  return (
    <button className="flex flex-col items-start gap-2 w-full p-3 rounded-lg transition-all hover:bg-accent">
      <div className="flex flex-col gap-2 p-4 pt-0 w-full">
        <div className="flex gap-2">
          <Avatar>
            <AvatarImage src="https://github.com/shadcn.png" alt="@shadcn"/>
            <AvatarFallback>CN</AvatarFallback>
          </Avatar>
          <div className="flex flex-col">
            <p className="text-black capitalize">{customer.name}</p>
            <p className="text-gray-500 text-sm">new message</p>
          </div>
        </div>
        <div className="text-right text-gray-500 text-sm">
          { formatDistanceToNow(new Date(customer.date), {addSuffix: true}) }
        </div>
      </div>
    </button>
  )
}

export default CustomerItem
