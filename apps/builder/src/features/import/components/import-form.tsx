"use client"

import { Card, CardContent } from "@chatbotx.io/ui/components/ui/card"

export function ImportForm({ children }: { children: React.ReactNode }) {
  return (
    <div className="my-4 flex flex-col items-center justify-center">
      <Card className="w-xl">
        <CardContent className="flex flex-col gap-4">{children}</CardContent>
      </Card>
    </div>
  )
}
