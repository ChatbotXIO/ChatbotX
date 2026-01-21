import { TriggerCondition } from "@aha.chat/database"

/**
 * Base event emitter class with common functionality
 */
export abstract class BaseEventEmitter {
  protected abstract supportedEventTypes: Set<TriggerCondition>
  protected abstract shouldEmitEvent(
    eventType: TriggerCondition,
    chatbotId: string,
    sourceId?: string,
  ): Promise<boolean>

  protected abstract emitToQueue(
    eventType: TriggerCondition,
    data: {
      chatbotId: string
      contactId: string
      metadata?: Record<string, unknown>
    },
  ): Promise<void>

  async emit(
    eventType: TriggerCondition,
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
    await this.emit(TriggerCondition.tagApplied, {
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
    await this.emit(TriggerCondition.tagRemoved, {
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
    await this.emit(TriggerCondition.customFieldValueChanged, {
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
    await this.emit(TriggerCondition.conversationTransferredToHuman, {
      chatbotId,
      contactId,
    })
  }

  async conversationTransferredToBot(
    chatbotId: string,
    contactId: string,
  ): Promise<void> {
    await this.emit(TriggerCondition.conversationTransferredToBot, {
      chatbotId,
      contactId,
    })
  }

  async contactCreated(chatbotId: string, contactId: string): Promise<void> {
    await this.emit(TriggerCondition.newContact, {
      chatbotId,
      contactId,
    })
  }

  async contactUnsubscribed(
    chatbotId: string,
    contactId: string,
  ): Promise<void> {
    await this.emit(TriggerCondition.contactUnsubscribedFormBroadcast, {
      chatbotId,
      contactId,
    })
  }

  async conversationArchived(
    chatbotId: string,
    contactId: string,
  ): Promise<void> {
    await this.emit(TriggerCondition.archived, {
      chatbotId,
      contactId,
    })
  }

  async conversationFollowUp(
    chatbotId: string,
    contactId: string,
  ): Promise<void> {
    await this.emit(TriggerCondition.followUp, {
      chatbotId,
      contactId,
    })
  }

  async conversationAssigned(
    chatbotId: string,
    contactId: string,
  ): Promise<void> {
    await this.emit(TriggerCondition.conversationAssigned, {
      chatbotId,
      contactId,
    })
  }

  async conversationUnassigned(
    chatbotId: string,
    contactId: string,
  ): Promise<void> {
    await this.emit(TriggerCondition.conversationUnassigned, {
      chatbotId,
      contactId,
    })
  }

  async sequenceSubscribed(
    chatbotId: string,
    contactId: string,
    sequenceId: string,
  ): Promise<void> {
    await this.emit(TriggerCondition.subscribedToSequence, {
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
    await this.emit(TriggerCondition.unsubscribedFromSequence, {
      chatbotId,
      contactId,
      metadata: { sourceId: sequenceId, sequenceId },
    })
  }
}
