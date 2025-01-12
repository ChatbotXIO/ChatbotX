import { getAllChatbots } from "@/features/chatbots/queries"

export default async function Page() {
  await getAllChatbots()

  return <div>hello</div>
}
