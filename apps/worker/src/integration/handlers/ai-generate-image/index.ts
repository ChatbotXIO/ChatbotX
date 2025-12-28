import { FileType } from "@aha.chat/database/types"
import { uploader } from "@aha.chat/filesystem"
import {
  AIGenerateImageProvider,
  AIGenerateImageQuality,
  DEFAULT_IMAGE_MODEL_IDS,
  OPENAI_DALLE3_QUALITY,
  OPENAI_IMAGE_MODEL_NAMES,
  type OpenAIDalle3QualityType,
  type SendImageStepSchema,
  StepType,
} from "@aha.chat/flow-config"
import { ChatJobAction, chatQueue } from "@aha.chat/worker-config"
import { createId } from "@paralleldrive/cuid2"
import { generateImage } from "ai"
import imageSize from "image-size"
import {
  replaceCustomFieldAttributes,
  saveResultToCustomField,
} from "../ai-shared-utils"
import type { FlowStepProps } from "../step-handler"
import { createImageModel, getAIImageProviderConfig } from "./provider"
import type { AIGenerateImageStep } from "./types"

export async function handleAIGenerateImage({
  conversation,
  flowVersionId,
  step,
}: FlowStepProps<Record<string, unknown>>) {
  const stepConfig = step as AIGenerateImageStep

  const aiConfig = await getAIImageProviderConfig(
    stepConfig,
    conversation.chatbotId,
  )
  if (!aiConfig) {
    return
  }

  const model = createImageModel(aiConfig, aiConfig.model)

  // Get the actual model name used (after mapping)
  const actualModel =
    aiConfig.model === DEFAULT_IMAGE_MODEL_IDS[AIGenerateImageProvider.OPENAI]
      ? OPENAI_IMAGE_MODEL_NAMES.DALLE_3
      : aiConfig.model

  // Resolve variables in prompt
  const prompt = await replaceCustomFieldAttributes(
    stepConfig.prompt,
    conversation.id,
  )

  const size =
    stepConfig.size === AIGenerateImageQuality.Auto
      ? undefined
      : (stepConfig.size as `${number}x${number}` | undefined)

  // Map quality to provider-specific values (only for DALL-E 3)
  let quality: OpenAIDalle3QualityType | undefined
  if (actualModel === OPENAI_IMAGE_MODEL_NAMES.DALLE_3) {
    if (stepConfig.quality === AIGenerateImageQuality.High) {
      quality = OPENAI_DALLE3_QUALITY.HD
    } else if (
      stepConfig.quality === AIGenerateImageQuality.Medium ||
      stepConfig.quality === AIGenerateImageQuality.Low
    ) {
      quality = OPENAI_DALLE3_QUALITY.STANDARD
    }
  }

  const result = await generateImage({
    model,
    prompt,
    size,
    providerOptions:
      actualModel === OPENAI_IMAGE_MODEL_NAMES.DALLE_3 && quality
        ? {
            openai: {
              quality,
            },
          }
        : undefined,
  })

  const image = result.image
  let imageUrl = ""
  let attachment: {
    originPath: string
    name: string
    mimeType: string
    size: number
    width?: number
    height?: number
    fileType: FileType
  } | null = null

  if (image.base64 || image.uint8Array) {
    const buffer = image.uint8Array
      ? Buffer.from(image.uint8Array)
      : Buffer.from(image.base64 ?? "", "base64")

    const dims = imageSize(buffer)
    const path = `public/ai-generated/${conversation.id}/${createId()}.png`

    await uploader.putObject(path, buffer, {
      ACL: "public-read",
      ContentType: "image/png",
      ContentLength: buffer.length,
    })

    imageUrl = path
    attachment = {
      originPath: path,
      name: "ai-generated.png",
      mimeType: "image/png",
      size: buffer.length,
      width: dims.width,
      height: dims.height,
      fileType: FileType.image,
    }
  }

  if (imageUrl) {
    await saveResultToCustomField({
      contactId: conversation.contactId,
      customFieldId: stepConfig.outputCfId,
      fullText: imageUrl,
      chatbotId: conversation.chatbotId,
    })

    await chatQueue.add(ChatJobAction.sendFlowMessage, {
      type: ChatJobAction.sendFlowMessage,
      data: {
        conversationId: conversation.id,
        flowVersionId,
        step: {
          id: createId(),
          stepType: StepType.sendImage,
          url: imageUrl,
          mode: "file",
          buttons: [],
          attachment,
        } as SendImageStepSchema & {
          attachment: typeof attachment
        },
      },
    })
  }
}
