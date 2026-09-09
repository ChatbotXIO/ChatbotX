import { type ChannelType, channelTypes } from "@chatbotx.io/utils/channel"
import type { z } from "zod"
import type { ButtonStepProps } from "../steps/button"
import { type StepType, stepTypes } from "../steps/step-action"
import { flowValidationCodes } from "../validation-codes"

/**
 * What a channel actually does with a media step, and therefore what the editor
 * warns about and what publish refuses.
 *
 * Kept apart from the step's editor/viewer modules — this is imported by
 * `validators.ts`, which is reached from both the builder's publish schema and
 * the worker's import validation, so it must stay React-free.
 */
export const mediaStepSupport = {
  /** Sent as authored, buttons included. */
  full: "full",
  /** Media is sent, but the step's `buttons` never reach the contact. */
  noButtons: "noButtons",
  /** The channel's `sendFlowStep` has no branch for it: nothing is sent. */
  unsupported: "unsupported",
} as const

export type MediaStepSupport =
  (typeof mediaStepSupport)[keyof typeof mediaStepSupport]

const MEDIA_STEP_TYPES = [
  stepTypes.enum.sendImage,
  stepTypes.enum.sendVideo,
  stepTypes.enum.sendAudio,
  stepTypes.enum.sendFile,
  stepTypes.enum.sendGif,
] as const

export type MediaStepType = (typeof MEDIA_STEP_TYPES)[number]

export const isMediaStepType = (stepType: string): stepType is MediaStepType =>
  (MEDIA_STEP_TYPES as readonly string[]).includes(stepType)

const { full, noButtons, unsupported } = mediaStepSupport

/**
 * Read off each integration's `sendFlowStep` switch, not assumed — a step type
 * with no `case` falls into `default: break` and is sent nowhere, which is
 * exactly what this table exists to surface:
 *
 * - **messenger** — image/video ride its media template with the buttons
 *   attached (`send-media.ts`), but `send-file.ts` never reads `step.buttons`,
 *   so audio/file lose them.
 * - **instagram** (both the Instagram-Login and Facebook-Login variants
 *   collapse to this channel) — no media template exists there, and every
 *   template that does replaces the media with its own rendering, so
 *   `convertFlowStepMedia` sends the media plain and logs the dropped buttons;
 *   `convertFlowStepFile` never reads them either.
 * - **whatsapp** — only `sendImage` (+ multiple images) has a branch; video,
 *   audio, file and gif hit `default: break`.
 * - **zalo** — image/gif/file have branches; video and audio do not.
 *   `send-file.ts` sends `attachment.payload.token` alone, so a file's buttons
 *   are lost, while `send-image.ts` does pass them through its media template.
 * - **telegram** — every media step carries the buttons as an inline keyboard.
 * - **tiktok** — only images can be sent at all, and the IMAGE payload has no
 *   button field.
 * - **api** — every media step maps to bare attachments in the envelope; only a
 *   carousel's cards carry buttons.
 * - **webchat** — its `sendFlowStep` is a no-op by design: the worker
 *   broadcasts the message row itself, buttons and attachments included.
 * - **smtp** declares `message: {}` (no handlers at all), so how a flow step
 *   behaves there is a separate question from media support — left `full` here
 *   rather than guessed at.
 *
 * `Record<ChannelType, …>` on purpose: adding a channel must not silently
 * inherit "everything works" (see the `Record<ChannelType` cascade note in
 * `packages/utils/src/channel.ts`).
 */
const MEDIA_STEP_SUPPORT: Record<
  ChannelType,
  Record<MediaStepType, MediaStepSupport>
> = {
  [channelTypes.enum.omnichannel]: {
    sendImage: full,
    sendVideo: full,
    sendAudio: full,
    sendFile: full,
    sendGif: full,
  },
  [channelTypes.enum.webchat]: {
    sendImage: full,
    sendVideo: full,
    sendAudio: full,
    sendFile: full,
    sendGif: full,
  },
  [channelTypes.enum.messenger]: {
    sendImage: full,
    sendVideo: full,
    sendAudio: noButtons,
    sendFile: noButtons,
    sendGif: full,
  },
  [channelTypes.enum.instagram]: {
    sendImage: noButtons,
    sendVideo: noButtons,
    sendAudio: noButtons,
    sendFile: noButtons,
    sendGif: full,
  },
  [channelTypes.enum.whatsapp]: {
    sendImage: full,
    sendVideo: unsupported,
    sendAudio: unsupported,
    sendFile: unsupported,
    sendGif: unsupported,
  },
  [channelTypes.enum.zalo]: {
    sendImage: full,
    sendVideo: unsupported,
    sendAudio: unsupported,
    sendFile: noButtons,
    sendGif: full,
  },
  [channelTypes.enum.telegram]: {
    sendImage: full,
    sendVideo: full,
    sendAudio: full,
    sendFile: full,
    sendGif: full,
  },
  [channelTypes.enum.tiktok]: {
    sendImage: noButtons,
    sendVideo: unsupported,
    sendAudio: unsupported,
    sendFile: unsupported,
    sendGif: unsupported,
  },
  [channelTypes.enum.api]: {
    sendImage: noButtons,
    sendVideo: noButtons,
    sendAudio: noButtons,
    sendFile: noButtons,
    sendGif: full,
  },
  [channelTypes.enum.smtp]: {
    sendImage: full,
    sendVideo: full,
    sendAudio: full,
    sendFile: full,
    sendGif: full,
  },
}

type MediaStepProps = {
  /** `chooseChannelStepSchema.channel` is a plain string, so an unknown or
   * empty value is representable and resolves to `full` — same fallback as
   * `resolveStepValidator`. */
  channel: string | null | undefined
  stepType: string
}

export const resolveMediaStepSupport = (
  props: MediaStepProps,
): MediaStepSupport => {
  if (!isMediaStepType(props.stepType)) {
    return full
  }

  return (
    MEDIA_STEP_SUPPORT[props.channel as ChannelType]?.[props.stepType] ?? full
  )
}

/** True when this channel sends nothing at all for this media step. */
export const isMediaStepUnsupported = (props: MediaStepProps): boolean =>
  resolveMediaStepSupport(props) === unsupported

/** True when the media is sent but the step's buttons are dropped on the way. */
export const isMediaButtonsDropped = (
  props: MediaStepProps & { buttons: ButtonStepProps[] | null | undefined },
): boolean =>
  (props.buttons?.length ?? 0) > 0 &&
  resolveMediaStepSupport(props) === noButtons

/** Channels with something to say about this step, i.e. every non-`full` one. */
export const channelsWithMediaStepLimits = (
  stepType: MediaStepType,
): ChannelType[] =>
  (Object.keys(MEDIA_STEP_SUPPORT) as ChannelType[]).filter(
    (channel) => MEDIA_STEP_SUPPORT[channel][stepType] !== full,
  )

/**
 * Blocks publish (and worker import) for a media step the node's channel
 * cannot deliver as authored. Bound to one channel by
 * `media-step-validators.ts`, so a node left on `omnichannel` — the default —
 * is never blocked: it may only ever serve channels that send the step in full.
 */
const readButtons = (step: unknown): ButtonStepProps[] => {
  if (typeof step !== "object" || step === null || !("buttons" in step)) {
    return []
  }

  const { buttons } = step as { buttons?: unknown }
  return Array.isArray(buttons) ? (buttons as ButtonStepProps[]) : []
}

export const refineMediaStepForChannel =
  (channel: ChannelType, stepType: StepType) =>
  /**
   * `step` is `unknown` because this runs behind a `ZodTypeAny`: the same
   * refinement is shared by five step schemas, and `sendGif` has no `buttons`
   * at all.
   */
  (step: unknown, ctx: z.RefinementCtx): void => {
    if (isMediaStepUnsupported({ channel, stepType })) {
      ctx.addIssue({
        code: "custom",
        message: flowValidationCodes.mediaStepUnsupported,
        path: ["url"],
      })
      return
    }

    if (
      isMediaButtonsDropped({ channel, stepType, buttons: readButtons(step) })
    ) {
      ctx.addIssue({
        code: "custom",
        message: flowValidationCodes.mediaButtonsUnsupported,
        path: ["buttons"],
      })
    }
  }
