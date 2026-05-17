import { HttpResponse, http } from "msw"

/**
 * MSW handlers for the OpenAI API (chat completions + embeddings). Import in
 * a test and register via `server.use(...testHandlers)` to intercept calls.
 */
export const testHandlers = [
  http.post("https://api.openai.com/v1/chat/completions", () =>
    HttpResponse.json({
      id: "chatcmpl-test",
      object: "chat.completion",
      created: 0,
      model: "gpt-4o-mini",
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: "test response" },
          finish_reason: "stop",
        },
      ],
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    }),
  ),

  http.post("https://api.openai.com/v1/embeddings", () =>
    HttpResponse.json({
      object: "list",
      data: [{ object: "embedding", index: 0, embedding: [0, 0, 0] }],
      model: "text-embedding-3-small",
      usage: { prompt_tokens: 0, total_tokens: 0 },
    }),
  ),
]
