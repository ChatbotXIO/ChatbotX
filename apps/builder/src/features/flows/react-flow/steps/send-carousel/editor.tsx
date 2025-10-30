"use client"

import { sendCardStepDefaultFn } from "@aha.chat/flow-config"
import { Button } from "@aha.chat/ui/components/ui/button"
import {
  Carousel,
  type CarouselApi,
  CarouselContent,
  CarouselItem,
} from "@aha.chat/ui/components/ui/carousel"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@aha.chat/ui/components/ui/tooltip"
import { ChevronLeft, ChevronRight, Minus, Plus } from "lucide-react"
import { useState } from "react"
import { useFieldArray, useFormContext } from "react-hook-form"
import SendCardStepEditor from "@/features/flows/react-flow/steps/send-card/editor"

type SendCarouselStepEditorProps = {
  parentName: string
}

const SendCarouselStepEditor = (props: SendCarouselStepEditorProps) => {
  const { parentName } = props

  const [api, setApi] = useState<CarouselApi>()
  const [_current, setCurrent] = useState<number>()

  const { control } = useFormContext()
  const { fields, append, remove } = useFieldArray({
    control,
    name: parentName,
  })

  const addCard = () => {
    append(sendCardStepDefaultFn())
    setCurrent(api?.selectedScrollSnap())
  }

  const removeCard = () => {
    remove(api?.selectedScrollSnap())
  }

  const onNext = () => {
    if (!api) {
      return
    }

    api.scrollNext()
    setCurrent(api.selectedScrollSnap())
  }

  const onPrev = () => {
    if (!api) {
      return
    }

    api.scrollPrev()
    setCurrent(api.selectedScrollSnap())
  }

  return (
    <>
      <Carousel opts={{ dragFree: false }} setApi={setApi}>
        <CarouselContent>
          {fields.map((field, index) => (
            <CarouselItem className="" key={field.id}>
              <div className="p-1">
                <SendCardStepEditor
                  parentName={`${parentName}.cards.${index}`}
                />
              </div>
            </CarouselItem>
          ))}
        </CarouselContent>
      </Carousel>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              className="absolute top-1/2 right-0 mt-[50px] size-8 shrink-0"
              onClick={addCard}
              size="icon"
              type="button"
              variant="ghost"
            >
              <Plus size={25} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Add</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {fields.length > 1 && (
        <>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  className="absolute top-1/2 right-0 mt-[85px] size-8 shrink-0"
                  onClick={removeCard}
                  size="icon"
                  type="button"
                  variant="ghost"
                >
                  <Minus size={25} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Delete</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  className="absolute top-3 right-0 size-8 shrink-0"
                  onClick={onNext}
                  type="button"
                  variant="ghost"
                >
                  <ChevronRight size={25} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Next</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  className="-left-3 absolute top-3 size-8 shrink-0"
                  onClick={onPrev}
                  type="button"
                  variant="ghost"
                >
                  <ChevronLeft size={25} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Prev</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </>
      )}
    </>
  )
}

export default SendCarouselStepEditor
