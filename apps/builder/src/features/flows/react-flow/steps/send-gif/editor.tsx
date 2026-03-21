"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@chatbotx.io/ui/components/ui/dialog"
import type { IGif } from "@giphy/js-types"
import { ImagePlayIcon } from "lucide-react"
import Image from "next/image"
import { useTranslations } from "next-intl"
import { type SyntheticEvent, useState } from "react"
import { useFormContext } from "react-hook-form"
import { GifFinder } from "@/components/gif-finder"
import { useStepStore } from "../../stores/step-store-provider"
import { BaseStepEditor } from "../base/editor"

const FindGifDialog = ({ parentName }: { parentName: string }) => {
  const t = useTranslations()
  const [open, setOpen] = useState(false)
  const { setValue, getValues } = useFormContext()
  const gifUrl = getValues(`${parentName}.url`)

  const handleSelectGif = (
    gif: IGif,
    e: SyntheticEvent<HTMLElement, Event>,
  ) => {
    e.preventDefault()
    setValue(`${parentName}.url`, gif.images.preview_gif.url)
    setOpen(false)
  }

  const organizationSettings = useStepStore(
    (state) => state.organizationSetings,
  )

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>
        <div className="flex justify-center">
          {gifUrl && gifUrl.length > 0 ? (
            <Button
              className="relative h-[150px] w-[240px] p-0!"
              variant="ghost"
            >
              <Image alt={parentName} fill={true} src={gifUrl} />
            </Button>
          ) : (
            <Button size="sm" type="button" variant="outline">
              {t("flows.actions.findGif")}
            </Button>
          )}
        </div>
      </DialogTrigger>

      <DialogContent className="max-h-screen overflow-y-scroll lg:max-w-5xl">
        <DialogHeader>
          <DialogTitle>
            {t("messages.poweredBy", { name: "GIPHY" })}
          </DialogTitle>
          <DialogDescription />
        </DialogHeader>

        <div className="h-[calc(100vh-300px)] overflow-y-auto overflow-x-hidden">
          {organizationSettings?.giphy?.apiKey && (
            <GifFinder
              apiKey={organizationSettings.giphy.apiKey}
              onSelect={handleSelectGif}
            />
          )}
          {!organizationSettings?.giphy?.apiKey && (
            <div className="flex flex-col items-center justify-center">
              <p className="text-gray-500 text-sm">
                {t("messages.noGiphyApiKey")}
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default function SendGifStepEditor({
  parentName,
}: {
  parentName: string
}) {
  return (
    <BaseStepEditor icon={ImagePlayIcon} title="GIF">
      <FindGifDialog parentName={parentName} />
    </BaseStepEditor>
  )
}

export { SendGifStepEditor }
