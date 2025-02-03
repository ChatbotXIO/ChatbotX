"use client"

import { Skeleton } from "@/components/ui/skeleton"

export default function ConversationLoading() {
  return (
    <div className="flex items-center gap-3">
      <Skeleton className="w-12 h-12 rounded-full" />
      <div className="space-y-2 w-full">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-[calc(100%-50px)]" />
      </div>
    </div>
  )
}
