import { Button } from "@/components/ui/button"

export default function OpenAIPromptsPage() {
  return (
    <div className="flex flex-col items-center justify-center">
      <h1 className="text-3xl">Agents</h1>
      <p className="mb-2">
        AI agents give you control over how AI answers customers based on your
        business information.
      </p>
      <Button type="button">Add</Button>
    </div>
  )
}
