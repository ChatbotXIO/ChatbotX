import { pollService } from "@chatbotx.io/business/poll"
import type { z } from "zod"
import type { pollFormRequest, pollPatchRequest } from "../schema/action"
import { loadPollLinks } from "./poll-links"
import { toPollDates, toPollListItem, toPollResource } from "./serialize"

type CreateBody = z.infer<typeof pollFormRequest>
type PatchBody = z.infer<typeof pollPatchRequest>

/**
 * Poll operations shared by the public (workspace token) and private (session)
 * routers: both resolve the workspace from their own auth and call these, so
 * the two surfaces cannot drift.
 */
export const pollOperations = {
  async list(input: {
    workspaceId: string
    name?: string
    page?: number
    perPage?: number
  }) {
    const result = await pollService.list(input)
    return {
      data: result.data.map(toPollListItem),
      pageCount: result.pageCount,
    }
  },

  async get(input: { workspaceId: string; id: string }) {
    return toPollResource(await pollService.findWithVoteCounts(input))
  },

  async create(input: { workspaceId: string } & CreateBody) {
    const dates = toPollDates(input)
    const poll = await pollService.create({
      ...input,
      startsAt: dates.startsAt as Date,
      endsAt: dates.endsAt as Date,
    })
    return toPollResource({
      ...poll,
      candidates: poll.candidates.map((c) => ({ ...c, votesCount: 0 })),
    })
  },

  async update(input: { workspaceId: string; id: string } & PatchBody) {
    const { workspaceId, id, ...body } = input
    const updated = await pollService.update({
      workspaceId,
      id,
      data: toPollDates(body),
    })
    return toPollResource(await pollService.withVoteCounts(updated))
  },

  async delete(input: { workspaceId: string; id: string }) {
    await pollService.delete(input)
  },

  async bulkDelete(input: { workspaceId: string; ids: string[] }) {
    return await pollService.bulkDelete(input)
  },

  async getLinks(input: { workspaceId: string; id: string }) {
    const { links } = await loadPollLinks({
      workspaceId: input.workspaceId,
      pollId: input.id,
    })
    return links
  },

  async getAnalytics(input: { workspaceId: string; id: string }) {
    const { poll, ...analytics } = await pollService.getAnalytics(input)
    return {
      ...analytics,
      poll: {
        ...poll,
        startsAt: poll.startsAt.toISOString(),
        endsAt: poll.endsAt.toISOString(),
      },
    }
  },
}
