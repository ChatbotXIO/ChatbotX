"use client"

import * as React from "react";
import { ScrollArea } from "@/components/ui/scroll-area"
import CustomerItem from "@/components/customer-item";
// import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { mails } from "@/components/mail/data";

export default function CustomerPage() {
  return (
    <ScrollArea className="h-screen px-2">
      { mails.map((item) => <CustomerItem key={item.id} customer={item} />) }
    </ScrollArea>
  )
}
