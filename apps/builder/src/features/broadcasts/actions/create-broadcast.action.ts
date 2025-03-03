"use server"

import {
  type ChatbotIdRequestParams,
  chatbotIdRequestParams,
} from "@/features/common/schemas"
import { chatbotActionClient } from "@/lib/safe-action"
import { findChatbotOrFail } from "@/lib/user-permissions"
import {
  BroadcastSchedulesType,
  BroadcastStatus,
  prisma,
  type Prisma,
  type User,
} from "@ahachat.ai/database"
import { revalidateTag } from "next/cache"
import {
  type CreateBroadcastRequest,
  createBroadcastRequest,
} from "../schemas/create-broadcast-schema"
import { ensureFlowIdIsExists } from "@/features/flows/queries"
export const createBroadcastAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdRequestParams.items)
  .schema(createBroadcastRequest)
  .action(
    async ({
      ctx,
      bindArgsParsedInputs: [chatbotId],
      parsedInput,
    }: {
      ctx: { user: User }
      bindArgsParsedInputs: ChatbotIdRequestParams
      parsedInput: CreateBroadcastRequest
    }) => {
      const { chatbot } = await findChatbotOrFail(ctx.user.id, chatbotId)
      const flow = await ensureFlowIdIsExists(chatbotId, parsedInput.flowId)

      const data: Prisma.BroadcastUncheckedCreateInput = {
        ...parsedInput,
        name: flow.name,
        chatbotId: chatbot.id,
        status: BroadcastStatus.SCHEDULED,
        schedulesAt: new Date(parsedInput.schedulesAt ?? new Date()),
      }
      if (
        data.schedulesType === BroadcastSchedulesType.NOW ||
        data.schedulesAt <= new Date()
      ) {
        data.status = BroadcastStatus.SENT
      }
      const contacts = await prisma.contact.findMany({
        select: {
          id: true,
        },
        where: {
          chatbotId: chatbot.id,
        },
      })

      await prisma.broadcast.create({
        data: {
          ...data,
          contacts: {
            create: contacts.map((contact) => ({
              contactId: contact.id,
            })),
          },
        },
      })

      // TODO: add logic to send broadcast

      revalidateTag(`chatbot:${chatbotId}#broadcasts`)
    },
  )
