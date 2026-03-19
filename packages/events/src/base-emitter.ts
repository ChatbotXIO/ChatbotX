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
    customFieldName: string,
    oldValue: unknown,
    newValue: unknown,
  ): Promise<void> {
    await this.emit(Condition.customFieldValueChanged, {
      chatbotId,
      contactId,
      metadata: {
        sourceId: customFieldId,
        customFieldId,
        customFieldName,
        oldValue,
        newValue,
      },
    })
  }

  async conversationTransferredToHuman(
    chatbotId: string,
    contactId: string,
    conversationId: string,
    transferredBy?: string,
  ): Promise<void> {
    await this.emit(Condition.conversationTransferredToHuman, {
      chatbotId,
      contactId,
      metadata: {
        conversationId,
        transferredBy,
      },
    })
  }

  async conversationTransferredToBot(
    chatbotId: string,
    contactId: string,
    conversationId: string,
    transferredBy?: string,
  ): Promise<void> {
    await this.emit(Condition.conversationTransferredToBot, {
      chatbotId,
      contactId,
      metadata: {
        conversationId,
        transferredBy,
      },
    })
  }

  async contactCreated(
    chatbotId: string,
    contactId: string,
    name?: string,
    phone?: string,
    email?: string,
    customFields?: Record<string, unknown>,
  ): Promise<void> {
    await this.emit(Condition.newContact, {
      chatbotId,
      contactId,
      metadata: {
        name,
        phone,
        email,
        customFields,
      },
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
    conversationId: string,
    archivedBy?: string,
  ): Promise<void> {
    await this.emit(Condition.archived, {
      chatbotId,
      contactId,
      metadata: {
        conversationId,
        archivedBy,
      },
    })
  }

  async conversationFollowUp(
    chatbotId: string,
    contactId: string,
    conversationId: string,
    markedBy?: string,
  ): Promise<void> {
    await this.emit(Condition.followUp, {
      chatbotId,
      contactId,
      metadata: {
        conversationId,
        markedBy,
      },
    })
  }

  async conversationAssigned(
    chatbotId: string,
    contactId: string,
    conversationId: string,
    assignedTo: string,
    assignedBy?: string,
  ): Promise<void> {
    await this.emit(Condition.conversationAssigned, {
      chatbotId,
      contactId,
      metadata: {
        conversationId,
        assignedTo,
        assignedBy,
      },
    })
  }

  async conversationUnassigned(
    chatbotId: string,
    contactId: string,
    conversationId: string,
    unassignedBy?: string,
  ): Promise<void> {
    await this.emit(Condition.conversationUnassigned, {
      chatbotId,
      contactId,
      metadata: {
        conversationId,
        unassignedBy,
      },
    })
  }

  async sequenceSubscribed(
    chatbotId: string,
    contactId: string,
    sequenceId: string,
    sequenceName: string,
  ): Promise<void> {
    await this.emit(Condition.subscribedToSequence, {
      chatbotId,
      contactId,
      metadata: { sourceId: sequenceId, sequenceId, sequenceName },
    })
  }

  async sequenceUnsubscribed(
    chatbotId: string,
    contactId: string,
    sequenceId: string,
    sequenceName: string,
  ): Promise<void> {
    await this.emit(Condition.unsubscribedFromSequence, {
      chatbotId,
      contactId,
      metadata: { sourceId: sequenceId, sequenceId, sequenceName },
    })
  }
}
