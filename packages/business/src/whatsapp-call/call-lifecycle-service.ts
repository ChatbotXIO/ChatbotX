import { whatsappCallRepository } from "@chatbotx.io/database/repositories"

type RepositoryInput<
  TMethod extends
    | "attachRecording"
    | "attachTranscript"
    | "createIfAbsent"
    | "updateInterimStatus",
> = Parameters<(typeof whatsappCallRepository)[TMethod]>[0]

/**
 * Persistence transitions driven by Meta's call webhooks and the recording /
 * transcript pipelines. Every write is a guarded, idempotent statement at the
 * repository, so each method is safe under webhook and job redelivery.
 */
class WhatsappCallLifecycleService {
  /**
   * Inserts the call row for a webhook-announced call unless one already
   * exists for its `wacid`. `isNew` is true only for the winning insert, so
   * one-shot side effects (triggers, webhooks) fire exactly once.
   */
  recordIncomingCall(input: RepositoryInput<"createIfAbsent">) {
    return whatsappCallRepository.createIfAbsent(input)
  }

  /**
   * Moves a live call to an interim status (`ringing`, `rejected`) without
   * ever downgrading a terminal one. Resolves to the previous status when a
   * transition happened, `undefined` otherwise.
   */
  advanceInterimStatus(input: RepositoryInput<"updateInterimStatus">) {
    return whatsappCallRepository.updateInterimStatus(input)
  }

  /** Stamps the stored recording once; `undefined` means another delivery already did. */
  attachRecording(input: RepositoryInput<"attachRecording">) {
    return whatsappCallRepository.attachRecording(input)
  }

  /** Stamps the transcript once; `undefined` means another delivery already did. */
  attachTranscript(input: RepositoryInput<"attachTranscript">) {
    return whatsappCallRepository.attachTranscript(input)
  }
}

export const whatsappCallLifecycleService = new WhatsappCallLifecycleService()
