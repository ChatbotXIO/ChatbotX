import { insertAIEmbedding, prisma } from "@aha.chat/database"
import { createOpenAI } from "@ai-sdk/openai"
import { createId } from "@paralleldrive/cuid2"
import { embed } from "ai"

export default async function CreateEmbeddingTestPage({
  params,
}: {
  params: Promise<{ chatbotId: string }>
}) {
  const { chatbotId } = await params

  const aiFileId = "by8bp8ao16nm3h6xn8bdb1g5"
  await prisma.aIFile.upsert({
    where: {
      id: aiFileId,
    },
    create: {
      id: aiFileId,
      chatbotId,
      name: "test",
      path: "test.pdf",
      size: 100,
      mimeType: "text/plain",
    },
    update: {
      updatedAt: new Date(),
    },
  })

  /**
   * MAIN FUNCTION HERE
   */

  const input =
    "Đã đi qua những ngày tết cổ truyền, tôi lại bước chân lên tàu và đi đến một miền đất xa xôi mà tôi đã chọn để học tập, tôi đi xa bà, xa ông, xa bạn bè, đặc biết nhất là xa quê hương. Ôi! Hai tiếng quê hương! Nhớ quê! Tôi chỉ biết khóc tôi thấy đâu đây vị ngọt ngào của nước mắt, chính quê hương đã ban cho tôi giọt nước mắt ngọt ngào đó, Ngày mai, tôi sẽ đi xa nơi đây đến phương trời kia không phải là phương trời quen thuộc như mỗi lần tôi nằm dưới bãi cỏ và ngắm nhìn bầu trời xanh kia. Đi! Thật xa gặp những con người mới ở xứ lạ. Tôi sẽ cố gắng học thật tốt dưới mảnh đất xa lạ ấy, quê hương tôi nằm ở đây trong con tim tôi đây này."

  const openai = createOpenAI({
    apiKey: "sk-xxx",
  })

  const embeddingModel = openai.embedding("text-embedding-ada-002")

  const { embedding } = await embed({
    model: embeddingModel,
    value: input,
  })

  // DIRTY HACK TO SAVE VECTOR TO DATABASE
  await prisma.$queryRawTyped(
    insertAIEmbedding(
      createId(),
      new Date(),
      new Date(),
      input,
      `[${embedding.toString()}]`,
      chatbotId,
      aiFileId,
    ),
  )

  return <div>CreateEmbeddingTestPage</div>
}