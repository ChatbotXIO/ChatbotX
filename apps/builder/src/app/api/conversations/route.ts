"use server"

import { InboxType } from "@ahachat.ai/database"
import { NextResponse } from "next/server"
import { z } from "zod"

const createConversationSchema = z.object({
  sourceId: z.string(),
  inboxType: z.nativeEnum(InboxType),
  contact: z.object({
    phoneNumber: z.string(),
    email: z.string().email(),
  }),
})

export async function POST(req: Request) {
  const data = await req.json()
  const validated = createConversationSchema.parse(data)

  return new NextResponse(JSON.stringify(validated))
}
