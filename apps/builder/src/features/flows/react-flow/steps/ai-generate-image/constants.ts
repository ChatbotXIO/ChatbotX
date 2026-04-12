import {
  type AIGenerateImageQualityType,
  aiGenerateImageQuality,
  type ImageAspectRatioType,
  imageAspectRatio,
} from "@chatbotx.io/flow-config"

type Option<TValue extends string> = {
  labelKey: string
  value: TValue
}

type ImageSizeType =
  | ImageAspectRatioType
  | "1024x1024"
  | "1536x1024"
  | "1024x1536"
  | "256x256"
  | "512x512"
  | "1792x1024"

export const imageQualityOptions: Option<AIGenerateImageQualityType>[] = [
  {
    labelKey: "fields.quality.options.auto",
    value: aiGenerateImageQuality.enum.auto,
  },
  {
    labelKey: "fields.quality.options.hd",
    value: aiGenerateImageQuality.enum.hd,
  },
  {
    labelKey: "fields.quality.options.md",
    value: aiGenerateImageQuality.enum.md,
  },
  {
    labelKey: "fields.quality.options.ld",
    value: aiGenerateImageQuality.enum.ld,
  },
]

export const imageSizeOptions: Option<ImageSizeType>[] = [
  {
    labelKey: "fields.size.options.auto",
    value: imageAspectRatio.enum.auto,
  },
  {
    labelKey: "fields.size.options.square1024",
    value: "1024x1024",
  },
  {
    labelKey: "fields.size.options.landscape1536x1024",
    value: "1536x1024",
  },
  {
    labelKey: "fields.size.options.portrait1024x1536",
    value: "1024x1536",
  },
  {
    labelKey: "fields.size.options.dalle2_256",
    value: "256x256",
  },
  {
    labelKey: "fields.size.options.dalle2_512",
    value: "512x512",
  },
  {
    labelKey: "fields.size.options.dalle3_1792x1024",
    value: "1792x1024",
  },
]

export const geminiAspectRatioOptions: Option<ImageAspectRatioType>[] = [
  {
    labelKey: "fields.size.options.auto",
    value: imageAspectRatio.enum.auto,
  },
  {
    labelKey: "fields.aspectRatio.options.ratio1x1",
    value: imageAspectRatio.enum["1:1"],
  },
  {
    labelKey: "fields.aspectRatio.options.ratio3x4",
    value: imageAspectRatio.enum["3:4"],
  },
  {
    labelKey: "fields.aspectRatio.options.ratio4x3",
    value: imageAspectRatio.enum["4:3"],
  },
  {
    labelKey: "fields.aspectRatio.options.ratio9x16",
    value: imageAspectRatio.enum["9:16"],
  },
  {
    labelKey: "fields.aspectRatio.options.ratio16x9",
    value: imageAspectRatio.enum["16:9"],
  },
]
