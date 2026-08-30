import {
  type ContactInfoType,
  type TriggerEventType,
  triggerEventTypes,
} from "@chatbotx.io/database/partials"
import { withContactInboxMetadata } from "./contact-inbox-context"

/**
 * Base event emitter class with common functionality
 */
export abstract class BaseEventEmitter {
  protected abstract supportedEventTypes: ReadonlySet<TriggerEventType>
  protected abstract shouldEmitEvent(
    eventType: TriggerEventType,
    workspaceId: string,
    sourceId?: string,
  ): Promise<boolean>

  protected abstract emitToQueue(
    eventType: TriggerEventType,
    data: {
      workspaceId: string
      contactId: string
      metadata?: Record<string, unknown>
    },
  ): Promise<void>

  async emit(
    eventType: TriggerEventType,
    data: {
      workspaceId: string
      contactId: string
      metadata?: Record<string, unknown>
    },
  ): Promise<void> {
    const { workspaceId, contactId, metadata = {} } = data

    if (!(workspaceId && contactId)) {
      return
    }

    if (!this.supportedEventTypes.has(eventType)) {
      return
    }

    const sourceId = metadata.sourceId as string | undefined
    const shouldEmit = await this.shouldEmitEvent(
      eventType,
      workspaceId,
      sourceId,
    )

    if (!shouldEmit) {
      return
    }

    await this.emitToQueue(eventType, data)
  }

  async tagApplied(
    workspaceId: string,
    contactId: string,
    tagId: string,
    contactInboxId?: string,
  ): Promise<void> {
    await this.emit(triggerEventTypes.enum.tagApplied, {
      workspaceId,
      contactId,
      metadata: withContactInboxMetadata(
        { sourceId: tagId, tagId },
        contactInboxId,
      ),
    })
  }

  async tagRemoved(
    workspaceId: string,
    contactId: string,
    tagId: string,
    contactInboxId?: string,
  ): Promise<void> {
    await this.emit(triggerEventTypes.enum.tagRemoved, {
      workspaceId,
      contactId,
      metadata: withContactInboxMetadata(
        { sourceId: tagId, tagId },
        contactInboxId,
      ),
    })
  }

  async customFieldChanged(
    workspaceId: string,
    contactId: string,
    customFieldId: string,
    customFieldName: string,
    oldValue: unknown,
    newValue: unknown,
    contactInboxId?: string,
  ): Promise<void> {
    await this.emit(triggerEventTypes.enum.customFieldValueChanged, {
      workspaceId,
      contactId,
      metadata: withContactInboxMetadata(
        {
          sourceId: customFieldId,
          customFieldId,
          customFieldName,
          oldValue,
          newValue,
        },
        contactInboxId,
      ),
    })
  }

  async contactInfoUpdated(
    workspaceId: string,
    contactId: string,
    infoType: ContactInfoType,
    oldValue: string | null,
    newValue: string,
  ): Promise<void> {
    await this.emit(triggerEventTypes.enum.contactInfoUpdated, {
      workspaceId,
      contactId,
      metadata: { sourceId: infoType, infoType, oldValue, newValue },
    })
  }

  async conversationTransferredToHuman(
    workspaceId: string,
    contactId: string,
    conversationId: string,
    transferredBy?: string,
  ): Promise<void> {
    await this.emit(triggerEventTypes.enum.conversationTransferredToHuman, {
      workspaceId,
      contactId,
      metadata: {
        conversationId,
        transferredBy,
      },
    })
  }

  async conversationTransferredToBot(
    workspaceId: string,
    contactId: string,
    conversationId: string,
    transferredBy?: string,
  ): Promise<void> {
    await this.emit(triggerEventTypes.enum.conversationTransferredToBot, {
      workspaceId,
      contactId,
      metadata: {
        conversationId,
        transferredBy,
      },
    })
  }

  async contactCreated(
    workspaceId: string,
    contactId: string,
    name?: string,
    phone?: string,
    email?: string,
    contactInboxId?: string,
  ): Promise<void> {
    await this.emit(triggerEventTypes.enum.newContact, {
      workspaceId,
      contactId,
      metadata: withContactInboxMetadata(
        { name, phone, email },
        contactInboxId,
      ),
    })
  }

  async contactReferredANewContact(
    workspaceId: string,
    contactId: string,
    refName?: string,
    reflinkId?: string,
    contactInboxId?: string,
  ): Promise<void> {
    await this.emit(triggerEventTypes.enum.contactReferredANewContact, {
      workspaceId,
      contactId,
      metadata: withContactInboxMetadata(
        { refName, reflinkId },
        contactInboxId,
      ),
    })
  }

  async contactReferredExistingContact(
    workspaceId: string,
    contactId: string,
    refName?: string,
    reflinkId?: string,
    contactInboxId?: string,
  ): Promise<void> {
    await this.emit(triggerEventTypes.enum.contactReferredExistingContact, {
      workspaceId,
      contactId,
      metadata: withContactInboxMetadata(
        { refName, reflinkId },
        contactInboxId,
      ),
    })
  }

  async contactUnsubscribed(
    workspaceId: string,
    contactId: string,
    contactInboxId?: string,
  ): Promise<void> {
    await this.emit(triggerEventTypes.enum.contactUnsubscribedFormBroadcast, {
      workspaceId,
      contactId,
      metadata: withContactInboxMetadata(undefined, contactInboxId),
    })
  }

  async conversationArchived(
    workspaceId: string,
    contactId: string,
    conversationId: string,
    archivedBy?: string,
  ): Promise<void> {
    await this.emit(triggerEventTypes.enum.archived, {
      workspaceId,
      contactId,
      metadata: {
        conversationId,
        archivedBy,
      },
    })
  }

  async conversationFollowUp(
    workspaceId: string,
    contactId: string,
    conversationId: string,
    markedBy?: string,
  ): Promise<void> {
    await this.emit(triggerEventTypes.enum.followUp, {
      workspaceId,
      contactId,
      metadata: {
        conversationId,
        markedBy,
      },
    })
  }

  async conversationAssigned(
    workspaceId: string,
    contactId: string,
    conversationId: string,
    assignedTo: string,
    assignedBy?: string,
  ): Promise<void> {
    await this.emit(triggerEventTypes.enum.conversationAssigned, {
      workspaceId,
      contactId,
      metadata: {
        conversationId,
        assignedTo,
        assignedBy,
      },
    })
  }

  async conversationUnassigned(
    workspaceId: string,
    contactId: string,
    conversationId: string,
    unassignedBy?: string,
  ): Promise<void> {
    await this.emit(triggerEventTypes.enum.conversationUnassigned, {
      workspaceId,
      contactId,
      metadata: {
        conversationId,
        unassignedBy,
      },
    })
  }

  async sequenceSubscribed(
    workspaceId: string,
    contactId: string,
    sequenceId: string,
    sequenceName: string,
    contactInboxId?: string,
  ): Promise<void> {
    await this.emit(triggerEventTypes.enum.subscribedToSequence, {
      workspaceId,
      contactId,
      metadata: withContactInboxMetadata(
        { sourceId: sequenceId, sequenceId, sequenceName },
        contactInboxId,
      ),
    })
  }

  async sequenceUnsubscribed(
    workspaceId: string,
    contactId: string,
    sequenceId: string,
    sequenceName: string,
    contactInboxId?: string,
  ): Promise<void> {
    await this.emit(triggerEventTypes.enum.unsubscribedFromSequence, {
      workspaceId,
      contactId,
      metadata: withContactInboxMetadata(
        { sourceId: sequenceId, sequenceId, sequenceName },
        contactInboxId,
      ),
    })
  }
}
