import {
  contactStatsRepository,
  type InsertContactEventRow,
} from "../repositories/postgres"
import type {
  ContactCountsSchema,
  ContactStats,
  ContactsByDimension,
  TimeRangeQuery,
} from "../schemas"
import type { ContactEventType } from "../schemas/contact-event"

export class ContactAnalyticsService {
  recordEvents(
    payloads: InsertContactEventRow[],
    eventType: ContactEventType,
  ): Promise<void> {
    return contactStatsRepository.insertEvents(payloads, eventType)
  }

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
}

export const contactAnalyticsService = new ContactAnalyticsService()
