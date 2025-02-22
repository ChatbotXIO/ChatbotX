"use server"

import { parseQueryFilterContact } from "@/features/contacts/actions/utils"
import { ensureFlowIdIsExists } from "@/features/flows/actions/utils"
import { authActionClient } from "@/lib/safe-action"
import { findChatbotOrFail } from "@/lib/user-permissions"
import { JOB_NAMES } from "@/scheduler/types"
import { flowQueue } from "@/workers/flow.worker"
import { BroadcastStatus, type User, prisma } from "@ahachat.ai/database"
import { revalidateTag } from "next/cache"
import {
  type CreateBroadcastBindSchema,
  type CreateBroadcastSchema,
  createBroadcastBindSchema,
  createBroadcastSchema,
} from "../schemas/create-broadcast-schema"

export const createBroadcastAction = authActionClient
  .schema(createBroadcastSchema)
  .bindArgsSchemas(createBroadcastBindSchema)
  .action(
    async ({
      ctx,
      parsedInput,
      bindArgsParsedInputs: [chatbotId],
    }: {
      ctx: { user: User }
      parsedInput: CreateBroadcastSchema
      bindArgsParsedInputs: CreateBroadcastBindSchema
    }) => {
      const { chatbot } = await findChatbotOrFail(ctx.user.id, chatbotId)
      const flow = await ensureFlowIdIsExists(parsedInput.flowId, chatbotId)
      const data = {
        ...parsedInput,
        name: flow.name,
        chatbotId: chatbot.id,
        status: BroadcastStatus.Scheduled as BroadcastStatus,
      }
      if (!parsedInput.schedulesAt) {
        data.schedulesAt = new Date().toISOString()
        data.status = BroadcastStatus.Sent
      }
      const contacts = await prisma.contact.findMany({
        where: {
          chatbotId: chatbotId,
          ...parseQueryFilterContact(parsedInput.conditions),
        },
        // todo Add query via inboxType and message on 24h
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
      if (!parsedInput.schedulesAt) {
        for (const contact of contacts) {
          // flowQueue.add(JOB_NAMES.StartFlow, {
          //   flowId: flow.id,
          //   contactId: contact.id,
          // })
        }
      }

      revalidateTag(`${ctx.user.id}#broadcasts`)

      return {
        successful: true,
      }
    },
  )
