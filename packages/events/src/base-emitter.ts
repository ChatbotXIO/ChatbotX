import { Condition } from "@chatbotx.io/database/enums"

/**
 * Base event emitter class with common functionality
 */
export abstract class BaseEventEmitter {
  protected abstract supportedEventTypes: Set<Condition>
  protected abstract shouldEmitEvent(
    eventType: Condition,
    chatbotId: bigint,
    sourceId?: string,
  ): Promise<boolean>

  protected abstract emitToQueue(
    eventType: Condition,
    data: {
      chatbotId: bigint
      contactId: bigint
      metadata?: Record<string, unknown>
    },
  ): Promise<void>

  async emit(
    eventType: Condition,
    data: {
      chatbotId: bigint
      contactId: bigint
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
    chatbotId: bigint,
    contactId: bigint,
    tagId: string,
  ): Promise<void> {
    await this.emit(Condition.tagApplied, {
      chatbotId,
      contactId,
      metadata: { sourceId: tagId, tagId },
    })
  }

  async tagRemoved(
    chatbotId: bigint,
    contactId: bigint,
    tagId: string,
  ): Promise<void> {
    await this.emit(Condition.tagRemoved, {
      chatbotId,
      contactId,
      metadata: { sourceId: tagId, tagId },
    })
  }

  async customFieldChanged(
    chatbotId: bigint,
    contactId: bigint,
    customFieldId: bigint,
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
    chatbotId: bigint,
    contactId: bigint,
    conversationId: bigint,
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
    chatbotId: bigint,
    contactId: bigint,
    conversationId: bigint,
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
    chatbotId: bigint,
    contactId: bigint,
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
    chatbotId: bigint,
    contactId: bigint,
  ): Promise<void> {
    await this.emit(Condition.contactUnsubscribedFormBroadcast, {
      chatbotId,
      contactId,
    })
  }

  async conversationArchived(
    chatbotId: bigint,
    contactId: bigint,
    conversationId: bigint,
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
    chatbotId: bigint,
    contactId: bigint,
    conversationId: bigint,
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
    chatbotId: bigint,
    contactId: bigint,
    conversationId: bigint,
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
    chatbotId: bigint,
    contactId: bigint,
    conversationId: bigint,
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
    chatbotId: bigint,
    contactId: bigint,
    sequenceId: bigint,
    sequenceName: string,
  ): Promise<void> {
    await this.emit(Condition.subscribedToSequence, {
      chatbotId,
      contactId,
      metadata: { sourceId: sequenceId, sequenceId, sequenceName },
    })
  }

  async sequenceUnsubscribed(
    chatbotId: bigint,
    contactId: bigint,
    sequenceId: bigint,
    sequenceName: string,
  ): Promise<void> {
    await this.emit(Condition.unsubscribedFromSequence, {
      chatbotId,
      contactId,
      metadata: { sourceId: sequenceId, sequenceId, sequenceName },
    })
  }
}
