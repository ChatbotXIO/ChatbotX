"use client"

import type { TypingStepSchema } from "@chatbotx.io/flow-config"

type TypingStepViewerProps = {
  data: TypingStepSchema
}

export default function TypingStepViewer(props: TypingStepViewerProps) {
  return (
    <div className="text-muted-foreground text-sm">
      Typing for {props.data.seconds} seconds
    </div>
  )
}
