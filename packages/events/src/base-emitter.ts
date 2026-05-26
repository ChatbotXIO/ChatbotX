import {
  type TriggerEventType,
  triggerEventTypes,
} from "@chatbotx.io/database/partials"

/**
 * Base event emitter class with common functionality
 */
export abstract class BaseEventEmitter {
  protected abstract supportedEventTypes: Set<TriggerEventType>
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
  ): Promise<void> {
    await this.emit(triggerEventTypes.enum.tagApplied, {
      workspaceId,
      contactId,
      metadata: { sourceId: tagId, tagId },
    })
  }

  async tagRemoved(
    workspaceId: string,
    contactId: string,
    tagId: string,
  ): Promise<void> {
    await this.emit(triggerEventTypes.enum.tagRemoved, {
      workspaceId,
      contactId,
      metadata: { sourceId: tagId, tagId },
    })
  }

  async customFieldChanged(
    workspaceId: string,
    contactId: string,
    customFieldId: string,
    customFieldName: string,
    oldValue: unknown,
    newValue: unknown,
  ): Promise<void> {
    await this.emit(triggerEventTypes.enum.customFieldValueChanged, {
      workspaceId,
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
    customFields?: Record<string, unknown>,
  ): Promise<void> {
    await this.emit(triggerEventTypes.enum.newContact, {
      workspaceId,
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
    workspaceId: string,
    contactId: string,
  ): Promise<void> {
    await this.emit(triggerEventTypes.enum.contactUnsubscribedFormBroadcast, {
      workspaceId,
      contactId,
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
  ): Promise<void> {
    await this.emit(triggerEventTypes.enum.subscribedToSequence, {
      workspaceId,
      contactId,
      metadata: { sourceId: sequenceId, sequenceId, sequenceName },
    })
  }

  async sequenceUnsubscribed(
    workspaceId: string,
    contactId: string,
    sequenceId: string,
    sequenceName: string,
  ): Promise<void> {
    await this.emit(triggerEventTypes.enum.unsubscribedFromSequence, {
      workspaceId,
      contactId,
      metadata: { sourceId: sequenceId, sequenceId, sequenceName },
    })
  }

  async lifecycleStageChanged(
    workspaceId: string,
    contactId: string,
    toStageId: string | null,
    fromStageId: string | null,
    toStageName?: string | null,
    fromStageName?: string | null,
  ): Promise<void> {
    // sourceId is the destination stage (most common matching case).
    // We also expose fromStageId/toStageId in metadata so evaluators can
    // implement "from any to X", "from X to any", "from X to Y" semantics.
    await this.emit(triggerEventTypes.enum.lifecycleStageChanged, {
      workspaceId,
      contactId,
      metadata: {
        sourceId: toStageId ?? undefined,
        toStageId,
        fromStageId,
        toStageName,
        fromStageName,
      },
    })
  }

  /**
   * Emitido quando uma conversa é aberta — seja criação inicial (1ª msg do
   * contato) ou reabertura (contato manda msg após conversa arquivada/fechada).
   * Source identifica origem da abertura (contact/user/workflow/api).
   */
  async conversationOpened(
    workspaceId: string,
    contactId: string,
    conversationId: string,
    source: "contact" | "user" | "workflow" | "api" = "contact",
    channel?: string | null,
  ): Promise<void> {
    await this.emit(triggerEventTypes.enum.conversationOpened, {
      workspaceId,
      contactId,
      metadata: {
        conversationId,
        source,
        channel,
      },
    })
  }

  /**
   * Emitido quando uma conversa é fechada (agente clica "fechar", workflow
   * fecha, etc). closedBy identifica quem fechou (user/workflow/bot/api).
   */
  async conversationClosed(
    workspaceId: string,
    contactId: string,
    conversationId: string,
    closedBy: "user" | "workflow" | "bot" | "api" = "user",
    closingCategoryId?: string | null,
  ): Promise<void> {
    await this.emit(triggerEventTypes.enum.conversationClosed, {
      workspaceId,
      contactId,
      metadata: {
        conversationId,
        closedBy,
        closingCategoryId,
        // sourceId permite filtrar por categoria de fechamento, se houver.
        sourceId: closingCategoryId ?? undefined,
      },
    })
  }

  /**
   * Emitido quando o agente clica num atalho (shortcut) no Inbox pra disparar
   * um flow manualmente. flowId é o flow alvo — o dispatcher usa pra rotear
   * direto sem matcher.
   */
  async shortcut(
    workspaceId: string,
    contactId: string,
    conversationId: string,
    flowId: string,
    triggeredByUserId?: string | null,
  ): Promise<void> {
    await this.emit(triggerEventTypes.enum.shortcut, {
      workspaceId,
      contactId,
      metadata: {
        conversationId,
        flowId,
        triggeredByUserId,
        // sourceId == flowId garante que o dispatcher só matcha esse flow
        // específico (atalhos disparam exatamente 1 flow).
        sourceId: flowId,
      },
    })
  }
}
