import type {
  ContactEventType,
  ContactStats,
  ContactsByDimension,
  DailyTotalContacts,
  MessagesBySenderStats,
  TimeRange,
} from "../models"
import { contactStatsRepository } from "../repositories"

export class ContactAnalyticsService {
  getStatsByMinute(
    chatbotId: string,
    timeRange: TimeRange,
    eventTypes?: ContactEventType[],
  ): Promise<ContactStats[]> {
    return contactStatsRepository.getStatsByMinute(
      chatbotId,
      timeRange,
      eventTypes,
    )
  }

  getStatsByHour(
    chatbotId: string,
    timeRange: TimeRange,
    eventTypes?: ContactEventType[],
  ): Promise<ContactStats[]> {
    return contactStatsRepository.getStatsByHour(
      chatbotId,
      timeRange,
      eventTypes,
    )
  }

  getStatsByDay(
    chatbotId: string,
    timeRange: TimeRange,
    timezone: string,
    eventTypes?: ContactEventType[],
  ): Promise<ContactStats[]> {
    return contactStatsRepository.getStatsByDay(
      chatbotId,
      timeRange,
      timezone,
      eventTypes,
    )
  }

  getTotalContactsByDay(
    chatbotId: string,
    timeRange: TimeRange,
    timezone: string,
  ): Promise<DailyTotalContacts[]> {
    return contactStatsRepository.getTotalContactsByDay(
      chatbotId,
      timeRange,
      timezone,
    )
  }

  getNewContactsCount(
    chatbotId: string,
    timeRange: TimeRange,
    timezone: string,
  ): Promise<number> {
    return contactStatsRepository.getNewContactsCount(
      chatbotId,
      timeRange,
      timezone,
    )
  }

  getContactsByCountry(
    chatbotId: string,
    timeRange: TimeRange,
    timezone: string,
  ): Promise<ContactsByDimension[]> {
    return contactStatsRepository.getContactsByCountry(
      chatbotId,
      timeRange,
      timezone,
    )
  }

  getContactsByChannel(
    chatbotId: string,
    timeRange: TimeRange,
    timezone: string,
  ): Promise<ContactsByDimension[]> {
    return contactStatsRepository.getContactsByChannel(
      chatbotId,
      timeRange,
      timezone,
    )
  }

  getActiveContacts(
    chatbotId: string,
    timeRange: TimeRange,
    timezone: string,
  ): Promise<number> {
    return contactStatsRepository.getActiveContacts(
      chatbotId,
      timeRange,
      timezone,
    )
  }

  getContactsBySource(
    chatbotId: string,
    timeRange: TimeRange,
    timezone: string,
  ): Promise<ContactsByDimension[]> {
    return contactStatsRepository.getContactsBySource(
      chatbotId,
      timeRange,
      timezone,
    )
  }

  getMessagesBySender(
    chatbotId: string,
    timeRange: TimeRange,
    timezone: string,
    granularity?: "day" | "month",
  ): Promise<MessagesBySenderStats[]> {
    return contactStatsRepository.getMessagesBySender(
      chatbotId,
      timeRange,
      timezone,
      granularity,
    )
  }
}

export const contactAnalyticsService = new ContactAnalyticsService()
