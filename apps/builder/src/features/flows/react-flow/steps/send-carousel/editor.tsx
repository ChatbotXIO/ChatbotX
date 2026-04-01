"use client"

import { cardLayouts } from "@chatbotx.io/database/partials"
import { sendCardStepDefaultFn } from "@chatbotx.io/flow-config"
import {
  SelectedSnapDisplay,
  useSelectedSnapDisplay,
} from "@chatbotx.io/ui/components/carousel-snap"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Carousel,
  type CarouselApi,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@chatbotx.io/ui/components/ui/carousel"
import { cn } from "@chatbotx.io/ui/lib/utils"
import {
  PlusIcon,
  RectangleHorizontalIcon,
  RectangleVerticalIcon,
  TrashIcon,
} from "lucide-react"
import { useState } from "react"
import { useFieldArray, useFormContext, useWatch } from "react-hook-form"
import SendCardStepEditor from "@/features/flows/react-flow/steps/send-card/editor"

type SendCarouselStepEditorProps = {
  parentName: string
}

const SendCarouselStepEditor = (props: SendCarouselStepEditorProps) => {
  const { parentName } = props

  const [api, setApi] = useState<CarouselApi>()
  const { selectedSnap, snapCount } = useSelectedSnapDisplay(api)

  const { control, setValue } = useFormContext()
  const { fields, append, insert, remove } = useFieldArray({
    control,
    name: `${parentName}.cards`,
  })

  const layout = useWatch({ name: `${parentName}.layout` })

  const insertCard = () => {
    const startIndex = selectedSnap

    if (selectedSnap === snapCount - 1) {
      append(sendCardStepDefaultFn())
    } else {
      insert(selectedSnap + 1, sendCardStepDefaultFn())
    }

    if (api) {
      api.reInit()
      api.scrollTo(startIndex, true)
    }
  }

  const removeCard = () => {
    remove(selectedSnap)

    if (api) {
      api.reInit()
    }
  }

  return (
    <div className="relative pr-3">
      <div className="absolute top-2 left-3 z-1 flex items-center gap-1 rounded-full bg-white px-2 py-1">
        <Button
          className={cn(
            "size-6 p-0!",
            layout === cardLayouts.enum.horizontal ? "text-destructive" : "",
          )}
          onClick={() =>
            setValue(`${parentName}.layout`, cardLayouts.enum.horizontal)
          }
          size="icon"
          variant="ghost"
        >
          <RectangleHorizontalIcon />
        </Button>
        <Button
          className={cn(
            "size-6 p-0!",
            layout === cardLayouts.enum.vertical ? "text-destructive" : "",
          )}
          onClick={() =>
            setValue(`${parentName}.layout`, cardLayouts.enum.vertical)
          }
          size="icon"
          variant="ghost"
        >
          <RectangleVerticalIcon />
        </Button>
      </div>

      <Carousel opts={{ loop: false }} setApi={setApi}>
        <CarouselContent>
          {fields.map((field, index) => (
            <CarouselItem key={field.id}>
              <SendCardStepEditor parentName={`${parentName}.cards.${index}`} />
            </CarouselItem>
          ))}
        </CarouselContent>

        <div className="absolute top-1/2 -right-3 flex -translate-y-1/2 flex-col gap-2">
          <Button
            className="size-6 cursor-pointer rounded-full"
            data-slot="carousel-add"
            disabled={fields.length >= 10}
            onClick={insertCard}
            type="button"
          >
            <PlusIcon />
            <span className="sr-only">Add slide</span>
          </Button>

          <Button
            className="size-6 cursor-pointer rounded-full"
            data-slot="carousel-remove"
            disabled={fields.length <= 1}
            onClick={removeCard}
            type="button"
            variant="destructive"
          >
            <TrashIcon />
            <span className="sr-only">Remove slide</span>
          </Button>
        </div>

        <div className="mt-1 flex items-center gap-1">
          <div className="flex flex-1 gap-1">
            <CarouselPrevious className="static top-0 translate-y-0" />
            <CarouselNext className="static top-0 translate-y-0" />
          </div>

          <SelectedSnapDisplay
            selectedSnap={selectedSnap}
            snapCount={snapCount}
          />
        </div>
      </Carousel>
    </div>
  )
}

export default SendCarouselStepEditor
