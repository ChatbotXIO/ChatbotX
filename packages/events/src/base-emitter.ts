import { Condition } from "@aha.chat/database/enums"

/**
 * Base event emitter class with common functionality
 */
export abstract class BaseEventEmitter {
  protected abstract supportedEventTypes: Set<Condition>
  protected abstract shouldEmitEvent(
    eventType: Condition,
    chatbotId: string,
    sourceId?: string,
  ): Promise<boolean>

  protected abstract emitToQueue(
    eventType: Condition,
    data: {
      chatbotId: string
      contactId: string
      metadata?: Record<string, unknown>
    },
  ): Promise<void>

  async emit(
    eventType: Condition,
    data: {
      chatbotId: string
      contactId: string
      metadata?: Record<string, unknown>
    },
  ): Promise<void> {
    const { chatbotId, contactId, metadata = {} } = data

    if (!(chatbotId && contactId)) {
      return
    }

    if (!this.supportedEventTypes.has(eventType)) {
      return
    }

    const sourceId = metadata.sourceId as string | undefined
    const shouldEmit = await this.shouldEmitEvent(
      eventType,
      chatbotId,
      sourceId,
    )

    console.log({
      emitter: this.constructor.name,
      shouldEmit,
      eventType,
      chatbotId,
      sourceId,
    })

    if (!shouldEmit) {
      return
    }

    await this.emitToQueue(eventType, data)
  }

  async tagApplied(
    chatbotId: string,
    contactId: string,
    tagId: string,
  ): Promise<void> {
    await this.emit(Condition.tagApplied, {
      chatbotId,
      contactId,
      metadata: { sourceId: tagId, tagId },
    })
  }

  async tagRemoved(
    chatbotId: string,
    contactId: string,
    tagId: string,
  ): Promise<void> {
    await this.emit(Condition.tagRemoved, {
      chatbotId,
      contactId,
      metadata: { sourceId: tagId, tagId },
    })
  }

  async customFieldChanged(
    chatbotId: string,
    contactId: string,
    customFieldId: string,
    oldValue: unknown,
    newValue: unknown,
  ): Promise<void> {
    await this.emit(Condition.customFieldValueChanged, {
      chatbotId,
      contactId,
      metadata: {
        sourceId: customFieldId,
        customFieldId,
        oldValue,
        newValue,
      },
    })
  }

  async conversationTransferredToHuman(
    chatbotId: string,
    contactId: string,
  ): Promise<void> {
    await this.emit(Condition.conversationTransferredToHuman, {
      chatbotId,
      contactId,
    })
  }

  async conversationTransferredToBot(
    chatbotId: string,
    contactId: string,
  ): Promise<void> {
    await this.emit(Condition.conversationTransferredToBot, {
      chatbotId,
      contactId,
    })
  }

  async contactCreated(chatbotId: string, contactId: string): Promise<void> {
    await this.emit(Condition.newContact, {
      chatbotId,
      contactId,
    })
  }

  async contactUnsubscribed(
    chatbotId: string,
    contactId: string,
  ): Promise<void> {
    await this.emit(Condition.contactUnsubscribedFormBroadcast, {
      chatbotId,
      contactId,
    })
  }

  async conversationArchived(
    chatbotId: string,
    contactId: string,
  ): Promise<void> {
    await this.emit(Condition.archived, {
      chatbotId,
      contactId,
    })
  }

  async conversationFollowUp(
    chatbotId: string,
    contactId: string,
  ): Promise<void> {
    await this.emit(Condition.followUp, {
      chatbotId,
      contactId,
    })
  }

  async conversationAssigned(
    chatbotId: string,
    contactId: string,
  ): Promise<void> {
    await this.emit(Condition.conversationAssigned, {
      chatbotId,
      contactId,
    })
  }

  async conversationUnassigned(
    chatbotId: string,
    contactId: string,
  ): Promise<void> {
    await this.emit(Condition.conversationUnassigned, {
      chatbotId,
      contactId,
    })
  }

  async sequenceSubscribed(
    chatbotId: string,
    contactId: string,
    sequenceId: string,
  ): Promise<void> {
    await this.emit(Condition.subscribedToSequence, {
      chatbotId,
      contactId,
      metadata: { sourceId: sequenceId, sequenceId },
    })
  }

  async sequenceUnsubscribed(
    chatbotId: string,
    contactId: string,
    sequenceId: string,
  ): Promise<void> {
    await this.emit(Condition.unsubscribedFromSequence, {
      chatbotId,
      contactId,
      metadata: { sourceId: sequenceId, sequenceId },
    })
  }
}
