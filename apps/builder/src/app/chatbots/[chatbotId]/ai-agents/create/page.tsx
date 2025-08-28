"use client"

import { Form } from "@aha.chat/ui/components/ui/form"
import { useForm } from "react-hook-form"
import { GeminiLanguageModelSelect } from "@/features/gemini/components/gemini-language-model-select"
import { OpenAILanguageModelSelect } from "@/features/openai/components/openai-select"

export default function CreateAIAgentPage() {
  const form = useForm()

  return (
    <div className="space-y-6">
      <h1 className="font-bold text-2xl">Create AI Agent</h1>

      <Form {...form}>
        <form>
          <div className="space-y-4">
            <OpenAILanguageModelSelect required />

            <GeminiLanguageModelSelect required />
          </div>
        </form>
      </Form>
    </div>
  )
}
