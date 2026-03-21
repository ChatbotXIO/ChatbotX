"use client"

import type { EmailLineStepSchema } from "@chatbotx.io/flow-config"
import { Separator } from "@chatbotx.io/ui/components/ui/separator"

type EmailLineStepViewerProps = {
  data: EmailLineStepSchema
}

export default function EmailLineStepViewer(_props: EmailLineStepViewerProps) {
  return <Separator />
}
