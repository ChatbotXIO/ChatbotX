"use client"

import { getIdFromParams } from "@chatbotx.io/utils"
import { useParams } from "next/navigation"

export const useChatbotId = () => {
  return getIdFromParams(useParams<{ chatbotId: string }>(), "chatbotId")
}
