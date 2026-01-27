"use client"

import type { EmailLineStepSchema } from "@aha.chat/flow-config"
import { Separator } from "@aha.chat/ui/components/ui/separator"

type EmailLineStepViewerProps = {
  data: EmailLineStepSchema
}

export default function EmailLineStepViewer(_props: EmailLineStepViewerProps) {
  return <Separator />
}
