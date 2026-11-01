import type { MUSE_TRANSCRIPTION_MODEL } from "@chatbotx.io/flow-config"
import { z } from "zod"

export const museModels = z.enum([
  "muse-spark-1.3",
  "muse-spark-1.2",
  "muse-wonder-1.0",
])
export type MuseModel = z.infer<typeof museModels>

export const museModelOptions: { label: string; value: MuseModel }[] = [
  {
    label: "Muse Spark 1.3",
    value: museModels.enum["muse-spark-1.3"],
  },
  {
    label: "Muse Spark 1.2",
    value: museModels.enum["muse-spark-1.2"],
  },
  {
    label: "Muse Wonder 1.0 (Preview)",
    value: museModels.enum["muse-wonder-1.0"],
  },
]

export const museAnalyzeImageModelOptions: {
  label: string
  value: MuseModel
}[] = [
  {
    label: "Muse Spark 1.3",
    value: museModels.enum["muse-spark-1.3"],
  },
  {
    label: "Muse Spark 1.2",
    value: museModels.enum["muse-spark-1.2"],
  },
]

export const museImageModels = z.enum(["muse-image-1.0"])
export type MuseImageModel = z.infer<typeof museImageModels>

export const museImageModelOptions: { label: string; value: MuseImageModel }[] =
  [
    {
      label: "Muse Image 1.0",
      value: museImageModels.enum["muse-image-1.0"],
    },
  ]

export type MuseTranscriptionModel = typeof MUSE_TRANSCRIPTION_MODEL
