import { db, eq, relationsFilterToSQL } from "@aha.chat/database/client"
import { rootFolderId } from "@aha.chat/database/enums"
import {
  contactsOnSequenceModel,
  sequenceModel,
  sequenceStepModel,
} from "@aha.chat/database/schema"
import {
  getPaginationWithDefaults,
  parseOrderByAsObject,
} from "@aha.chat/database/utils"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import type { ListSequencesRequest, ListSequencesResponse } from "../schema"

export async function listSequences(
  input: ListSequencesRequest,
): Promise<ListSequencesResponse> {
  await assertCurrentUserCanAccessChatbot(input.chatbotId)

  let folderIdFilter: string | { isNull: true } | undefined
  if (input.folderId) {
    folderIdFilter =
      input.folderId === rootFolderId
        ? { isNull: true as const }
        : input.folderId
  }

  const where = {
    chatbotId: input.chatbotId,
    folderId: folderIdFilter,
    name: input.name
      ? {
          ilike: `%${input.name}%`,
        }
      : undefined,
    active:
      input.active !== undefined && input.active !== null
        ? input.active
        : undefined,
  }

  const pagination = getPaginationWithDefaults(input)
  const orderBy = parseOrderByAsObject(sequenceModel, input)

  const [data, total] = await Promise.all([
    db.query.sequenceModel.findMany({
      where,
      orderBy,
      ...pagination,
      extras: {
        stepsCount: (table) =>
          db.$count(
            sequenceStepModel,
            eq(sequenceStepModel.sequenceId, table.id),
          ),
        subscribersCount: (table) =>
          db.$count(
            contactsOnSequenceModel,
            eq(contactsOnSequenceModel.sequenceId, table.id),
          ),
      },
    }),
    db.$count(sequenceModel, relationsFilterToSQL(sequenceModel, where)),
  ])

  const pageCount = Math.ceil(total / pagination.limit)

  return { data, pageCount }
}

export async function getSequence(chatbotId: string, sequenceId: string) {
  await assertCurrentUserCanAccessChatbot(chatbotId)

  const sequence = await db.query.sequenceModel.findFirst({
    where: {
      id: sequenceId,
      chatbotId,
    },
    with: {
      sequenceSteps: {
        with: {
          flow: true,
        },
        orderBy: (step, { asc }) => [asc(step.order)],
      },
    },
  })

  if (!sequence) {
    throw new Error("Sequence not found")
  }

  return {
    ...sequence,
    steps: sequence.sequenceSteps,
  }
}
