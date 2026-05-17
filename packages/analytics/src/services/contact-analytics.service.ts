import { contactStatsRepository } from "../repositories"
import type {
  ContactCountsSchema,
  ContactEventType,
  ContactStats,
  ContactsByDimension,
  MessagesBySenderStats,
  TimeRangeQuery,
} from "../schemas"
import type {
  HumanAgentStats,
  MessagesByAdminStats,
} from "../schemas/contact-stats"

export class ContactAnalyticsService {
  getStatsByMinute(
    props: TimeRangeQuery & {
      eventTypes?: ContactEventType[]
    },
  ): Promise<ContactStats[]> {
    return contactStatsRepository.getStatsByMinute(props)
  }

  getStatsByHour(
    props: TimeRangeQuery & {
      eventTypes?: ContactEventType[]
    },
  ): Promise<ContactStats[]> {
    return contactStatsRepository.getStatsByHour(props)
  }

  getStatsByDay(
    props: TimeRangeQuery & {
      eventTypes?: ContactEventType[]
    },
  ): Promise<ContactStats[]> {
    return contactStatsRepository.getStatsByDay(props)
  }

  getContactCountsPerDay(
    props: TimeRangeQuery,
  ): Promise<ContactCountsSchema[]> {
    return contactStatsRepository.getContactCountsPerDay(props)
  }

  getNewContactsPerDay(props: TimeRangeQuery): Promise<ContactCountsSchema[]> {
    return contactStatsRepository.getNewContactsPerDay(props)
  }

  getNewContactsCount(props: TimeRangeQuery): Promise<number> {
    return contactStatsRepository.getNewContactsCount(props)
  }

  getContactsCount(props: TimeRangeQuery): Promise<number> {
    return contactStatsRepository.getContactsCount(props)
  }

  getContactsByCountry(props: TimeRangeQuery): Promise<ContactsByDimension[]> {
    return contactStatsRepository.getContactsByCountry(props)
  }

  getContactsByChannel(props: TimeRangeQuery): Promise<ContactsByDimension[]> {
    return contactStatsRepository.getContactsByChannel(props)
  }

  getActiveContactsCount(props: TimeRangeQuery): Promise<number> {
    return contactStatsRepository.getActiveContactsCount(props)
  }

  getContactsBySource(props: TimeRangeQuery): Promise<ContactsByDimension[]> {
    return contactStatsRepository.getContactsBySource(props)
  }

  getMessagesBySender(
    props: TimeRangeQuery & {
      granularity?: "day" | "month"
    },
  ): Promise<MessagesBySenderStats[]> {
    return contactStatsRepository.getMessagesBySender(props)
  }

  getMessagesByAdmin(props: TimeRangeQuery): Promise<MessagesByAdminStats[]> {
    return contactStatsRepository.getMessagesByAdmin(props)
  }

  getHumanAgentStats(props: TimeRangeQuery): Promise<HumanAgentStats[]> {
    return contactStatsRepository.getHumanAgentStats(props)
  }
}

export const contactAnalyticsService = new ContactAnalyticsService()
