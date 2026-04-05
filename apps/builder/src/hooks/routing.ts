"use client"

import { getIdFromParams } from "@chatbotx.io/utils"
import { useParams } from "next/navigation"

export const useWorkspaceId = () => {
  return getIdFromParams(useParams<{ workspaceId: string }>(), "workspaceId")
}
