"use server"

import { getFlows } from "../queries"

export async function fetchFlows(chatbotId: string) {
  const { data } = await getFlows({
    chatbotId,
    folderId: undefined,
    perPage: 500,
    title: "",
    sort: [{ id: "updatedAt", desc: true }],
    page: 1,
  })

  return data
}
