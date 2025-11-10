"use server"

import {
  BroadcastSchedulesType,
  BroadcastStatus,
  type Prisma,
  prisma,
} from "@aha.chat/database"
import {
  type ChatbotIdRequestParams,
  chatbotIdRequestParams,
} from "@/features/common/schemas"
import { ensureFlowIdIsExists } from "@/features/flows/queries"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { chatbotActionClient } from "@/lib/safe-action"
import {
  type CreateBroadcastRequest,
  createBroadcastRequest,
} from "../schemas/create-broadcast-schema"
export const createBroadcastAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdRequestParams)
  .inputSchema(createBroadcastRequest)
  .action(
    async ({
      bindArgsParsedInputs: [chatbotId],
      parsedInput,
    }: {
      bindArgsParsedInputs: ChatbotIdRequestParams
      parsedInput: CreateBroadcastRequest
    }) => {
      const flow = await ensureFlowIdIsExists(chatbotId, parsedInput.flowId)

      const data: Prisma.BroadcastUncheckedCreateInput = {
        ...parsedInput,
        name: flow.name,
        chatbotId,
        status: BroadcastStatus.scheduled,
        schedulesAt: new Date(parsedInput.schedulesAt ?? new Date()),
      }
      if (
        data.schedulesType === BroadcastSchedulesType.now ||
        data.schedulesAt <= new Date()
      ) {
        data.status = BroadcastStatus.sent
      }
      const contacts = await prisma.contact.findMany({
        select: {
          id: true,
        },
        where: {
          chatbotId,
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

      revalidateCacheTags(`chatbots:${chatbotId}#broadcasts`)
    },
  )
