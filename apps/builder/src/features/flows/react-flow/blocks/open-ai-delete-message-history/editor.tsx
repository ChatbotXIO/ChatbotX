"use client"

import { OpenAIDialog } from "@/features/flows/react-flow/blocks/open-ai/components/dialog"

interface OpenAIDeleteMessageHistoryEditorProps {
  parentName: string
}

export const OpenAIDeleteMessageHistoryEditor = ({
  parentName,
}: OpenAIDeleteMessageHistoryEditorProps) => {
  return <OpenAIDialog name="Flows.OpenAI.Title.DeleteMessageHistory" />
}
