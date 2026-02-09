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
    eventTypes?: ContactEventType[],
  ): Promise<ContactStats[]> {
    return contactStatsRepository.getStatsByDay(
      chatbotId,
      timeRange,
      eventTypes,
    )
  }

  getTotalContactsByDay(
    chatbotId: string,
    timeRange: TimeRange,
  ): Promise<DailyTotalContacts[]> {
    return contactStatsRepository.getTotalContactsByDay(chatbotId, timeRange)
  }

  getNewContactsCount(
    chatbotId: string,
    timeRange: TimeRange,
  ): Promise<number> {
    return contactStatsRepository.getNewContactsCount(chatbotId, timeRange)
  }

  getContactsByCountry(
    chatbotId: string,
    timeRange: TimeRange,
  ): Promise<ContactsByDimension[]> {
    return contactStatsRepository.getContactsByCountry(chatbotId, timeRange)
  }

  getContactsByChannel(
    chatbotId: string,
    timeRange: TimeRange,
  ): Promise<ContactsByDimension[]> {
    return contactStatsRepository.getContactsByChannel(chatbotId, timeRange)
  }

  getActiveContacts(chatbotId: string, timeRange: TimeRange): Promise<number> {
    return contactStatsRepository.getActiveContacts(chatbotId, timeRange)
  }

  getContactsBySource(
    chatbotId: string,
    timeRange: TimeRange,
  ): Promise<ContactsByDimension[]> {
    return contactStatsRepository.getContactsBySource(chatbotId, timeRange)
  }

  getMessagesBySender(
    chatbotId: string,
    timeRange: TimeRange,
    granularity?: "day" | "month",
  ): Promise<MessagesBySenderStats[]> {
    return contactStatsRepository.getMessagesBySender(
      chatbotId,
      timeRange,
      granularity,
    )
  }
}

export const contactAnalyticsService = new ContactAnalyticsService()
