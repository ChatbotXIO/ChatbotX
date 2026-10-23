import type { DatabaseClient } from "@chatbotx.io/database/client"
import {
  type CreatedEmailRecipient,
  type CreateEmailRecipientInput,
  type EmailRecipientTransition,
  type EmailTopicCounterIncrement,
  emailTopicStatsRepository,
} from "../repositories/postgres/email-topic-stats.repository"

export class EmailTopicAnalyticsService {
  createRecipient(
    input: CreateEmailRecipientInput,
    tx?: DatabaseClient,
  ): Promise<CreatedEmailRecipient> {
    return emailTopicStatsRepository.createRecipient(input, tx)
  }

  markDelivered(
    token: string,
    tx?: DatabaseClient,
  ): Promise<EmailRecipientTransition | null> {
    return emailTopicStatsRepository.markDelivered(token, tx)
  }

  incrementTopicCounter(
    increment: EmailTopicCounterIncrement,
    tx?: DatabaseClient,
  ): Promise<unknown> {
    return emailTopicStatsRepository.incrementTopicCounter(increment, tx)
  }

  markFailed(token: string): Promise<void> {
    return emailTopicStatsRepository.markFailed(token).then(() => undefined)
  }

  recordOpen(
    token: string,
    tx?: DatabaseClient,
  ): Promise<EmailRecipientTransition | null> {
    return emailTopicStatsRepository.recordOpen(token, tx)
  }

  recordClick(
    token: string,
    tx?: DatabaseClient,
  ): Promise<EmailRecipientTransition | null> {
    return emailTopicStatsRepository.recordClick(token, tx)
  }
}

export const emailTopicAnalyticsService = new EmailTopicAnalyticsService()
