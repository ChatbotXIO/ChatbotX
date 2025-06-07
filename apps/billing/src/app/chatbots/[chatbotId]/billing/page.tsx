import { auth } from "@/auth"

export default async function ChatbotBillingPage() {
  const session = await auth()
  console.log("sessionnnnn", session)

  return "BillingPage11"
}
