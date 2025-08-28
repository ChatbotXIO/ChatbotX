import { createOpenAI } from "@ai-sdk/openai"
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js"
import { experimental_createMCPClient, streamText } from "ai"

export async function POST(req: Request) {
  const { prompt }: { prompt: string } = await req.json()

  // await prisma.aIFile.create({
  //   data: {
  //     id: "afn6wu1o5umlpzg2zv0ly0gx",
  //     chatbotId: "uo5huz0yk125ubj5om32c1g0",
  //     name: "FAQ - AI Bán Hàng - Trang tính1-1755188229.pdf",
  //     path: "ai-files/FAQ-AI.pdf",
  //     size: 68_200,
  //     mimeType: "application/pdf",
  //   },
  // })

  const httpTransport = new StreamableHTTPClientTransport(
    new URL("https://ahabanana-store.myshopify.com/api/mcp"),
  )
  const httpClient = await experimental_createMCPClient({
    transport: httpTransport,
  })
  const toolSetTwo = await httpClient.tools()
  const tools = {
    ...toolSetTwo,
  }

  const openai = createOpenAI({
    apiKey:
      "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",
  })

  // const prompt = "bạn có những sản phẩm gì?"

  // console.log("fffffffff", tools)

  const response = await streamText({
    model: openai("gpt-4o"),
    tools,
    prompt,
    // When streaming, the client should be closed after the response is finished:
    onFinish: async () => {
      // await stdioClient.close()
      await httpClient.close()
      // await sseClient.close()
    },
    // Closing clients onError is optional
    // - Closing: Immediately frees resources, prevents hanging connections
    // - Not closing: Keeps connection open for retries
    onError: async (_error) => {
      // await stdioClient.close()
      await httpClient.close()
      // await sseClient.close()
    },
  })

  return response.toTextStreamResponse()

  // const { text } = await generateText({
  //   model: google("gemini-2.5-flash"),
  //   prompt: "Explain the concept of the Hilbert space.",
  // })
}
