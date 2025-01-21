import { Button } from "@/components/ui/button"

export default function OpenAIAssistantPage() {
  return (
    <div className="flex flex-col items-center justify-center">
      <h1 className="text-3xl">Assistants</h1>
      <p className="mb-2">
        Assistants are similar to AI agents. Use it when you want to use a large
        amount of data on files.
      </p>
      <Button type="button">Add</Button>
    </div>
  )
}
