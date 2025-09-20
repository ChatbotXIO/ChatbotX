import { Button } from "@aha.chat/ui/components/ui/button"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Test Embed - Aha Chat",
  description: "Test page for webchat embed functionality",
}

export default function TestEmbedPage() {
  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="mx-auto max-w-4xl">
        <h1 className="mb-8 font-bold text-3xl text-gray-900">
          Test Webchat Embed
        </h1>

        <div className="space-y-6">
          <div className="rounded-lg bg-white p-6 shadow">
            <h2 className="mb-4 font-semibold text-xl">Instructions</h2>
            <ol className="list-decimal space-y-2 text-gray-700">
              <li>Create a webchat in your chatbot dashboard</li>
              <li>Add this domain to the authorized domains list</li>
              <li>Copy the embed code from the webchat management page</li>
              <li>Paste the embed code below and click "Load Widget"</li>
            </ol>
          </div>

          <div className="rounded-lg bg-white p-6 shadow">
            <h2 className="mb-4 font-semibold text-xl">Embed Code</h2>
            <textarea
              className="w-full rounded border p-3 font-mono text-sm"
              id="embed-code"
              placeholder="Paste your embed code here..."
              rows={6}
            />
            <Button
              className="mt-3 rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
              onClick={() => {
                const code = document.getElementById("embed-code")?.textContent
                if (code) {
                  // Remove any existing widget
                  const existing = document.getElementById("aha-chat-widget")
                  if (existing) {
                    existing.remove()
                  }

                  // Create a script element and execute the code
                  const script = document.createElement("script")
                  script.textContent = code
                  document.head.appendChild(script)
                }
              }}
            >
              Load Widget
            </Button>
          </div>

          <div className="rounded-lg bg-white p-6 shadow">
            <h2 className="mb-4 font-semibold text-xl">Sample Content</h2>
            <p className="text-gray-700">
              This is some sample content to demonstrate how the chat widget
              appears on a real website. The widget should appear as a floating
              button in the bottom-right corner when loaded.
            </p>
            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="rounded border p-4">
                <h3 className="font-semibold">Feature 1</h3>
                <p className="text-gray-600 text-sm">
                  Lorem ipsum dolor sit amet, consectetur adipiscing elit.
                </p>
              </div>
              <div className="rounded border p-4">
                <h3 className="font-semibold">Feature 2</h3>
                <p className="text-gray-600 text-sm">
                  Sed do eiusmod tempor incididunt ut labore et dolore magna
                  aliqua.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
