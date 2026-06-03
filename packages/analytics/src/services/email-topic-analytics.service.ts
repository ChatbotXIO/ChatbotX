import {
  type CreateEmailRecipientInput,
  emailTopicStatsRepository,
} from "../repositories/postgres/email-topic-stats.repository"

export class EmailTopicAnalyticsService {
  createRecipient(
    input: CreateEmailRecipientInput,
  ): Promise<{ token: string }> {
    return emailTopicStatsRepository.createRecipient(input)
  }

  markDelivered(token: string): Promise<void> {
    return emailTopicStatsRepository.markDelivered(token)
  }

  markFailed(token: string): Promise<void> {
    return emailTopicStatsRepository.markFailed(token).then(() => undefined)
  }

  recordOpen(token: string): Promise<void> {
    return emailTopicStatsRepository.recordOpen(token)
  }

  recordClick(token: string): Promise<void> {
    return emailTopicStatsRepository.recordClick(token)
  }
}

export const emailTopicAnalyticsService = new EmailTopicAnalyticsService()
