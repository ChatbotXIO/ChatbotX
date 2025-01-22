"use client"

import type { getOpenAIPromptByID } from "@/features/integrations/open-ai/queries"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { XIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { use, useEffect, useState } from "react"

type MessageRole = "user" | "agent"

type PromptMessage = {
  id: string | number
  content: string
  role: MessageRole
}

type PromptItemProps = {
  msg: PromptMessage
  msgIndex: number
  changeRole: (key: number) => void
  deleteMsg: (key: number) => void
}

const MessageItem = ({
  msg,
  msgIndex,
  changeRole,
  deleteMsg,
}: PromptItemProps) => {
  return (
    <div className="flex items-center gap-3 mb-3">
      <Button
        variant="outline"
        className="rounded-full min-w-[100px] capitalize"
        onClick={() => changeRole(msgIndex)}
      >
        {msg.role}
      </Button>
      <Input placeholder="Type a message..." />
      <Button variant="ghost" size="icon" onClick={() => deleteMsg(msgIndex)}>
        <XIcon />
      </Button>
    </div>
  )
}

type OpenAIPromptEditProps = {
  promises: Promise<[Awaited<ReturnType<typeof getOpenAIPromptByID>>]>
}

export default function OpenAIPromptEdit({ promises }: OpenAIPromptEditProps) {
  const [{ data }] = use(promises)
  const router = useRouter()
  const [prompt, setPrompt] = useState({})

  const onAddMore = () => {
    const currentPrompt = { ...prompt }
    const messages = currentPrompt?.json_builder?.messages

    if (!messages.length) {
      messages.push({
        id: new Date().getTime(),
        content: "",
        role: "user",
      })
    } else {
      messages.push({
        id: new Date().getTime(),
        content: "",
        role: messages[messages.length - 1]?.role === "user" ? "agent" : "user",
      })
    }

    currentPrompt.json_builder.messages = messages
    setPrompt(currentPrompt)
  }

  const onChangeRole = (key: number) => {
    const currentPrompt = { ...prompt }
    const messages = currentPrompt?.json_builder?.messages

    const msgChange = messages[key]

    if (msgChange) {
      msgChange.role = msgChange.role === "user" ? "agent" : "user"
      messages[key] = msgChange
    }

    currentPrompt.json_builder.messages = messages

    setPrompt(currentPrompt)
  }

  const onDelete = (key: number) => {
    const currentPrompt = { ...prompt }
    const messages = currentPrompt?.json_builder?.messages
    messages.splice(key, 1)
    currentPrompt.json_builder.messages = messages
    setPrompt(currentPrompt)
  }

  const onSave = () => {
    console.log(prompt)
  }

  const onCancel = () => router.back()

  useEffect(() => {
    setPrompt(data)
  }, [data])

  return (
    <>
      <div className="flex items-center justify-end gap-3 p-3 mb-5">
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={onSave}>Save</Button>
      </div>

      <div className="flex flex-col w-full mr-auto ml-auto p-2 rounded-xl shadow-xl md:w-1/2 md:p-4">
        <div className="mb-3 flex items-center gap-2">
          <Label>Name:</Label>
          <Label className="font-bold">{prompt?.name}</Label>
        </div>
        <div className="mb-3">
          <Label>Prompt</Label>
          <Textarea
            placeholder="You are helpful assistant."
            value={prompt?.json_builder?.system}
          />
        </div>

        {prompt?.json_builder?.messages.map(
          (msg: PromptMessage, idx: number) => (
            <MessageItem
              key={msg.id}
              msgIndex={idx}
              msg={msg}
              changeRole={onChangeRole}
              deleteMsg={onDelete}
            />
          ),
        )}

        <div>
          <Button className="w-full" onClick={onAddMore}>
            Add More
          </Button>
        </div>
      </div>
    </>
  )
}
