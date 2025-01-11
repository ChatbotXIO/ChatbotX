"use client"

import { Button } from "@/components/ui/button"
import {
  Carousel,
  type CarouselApi,
  CarouselContent,
  CarouselItem,
} from "@/components/ui/carousel"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { SendCardBlockEditor } from "@/features/flows/react-flow/blocks/send-card/editor"
import { sendCardBlockDefaultValue } from "@/features/flows/react-flow/blocks/send-card/schema"
import { ChevronLeft, ChevronRight, Minus, Plus } from "lucide-react"
import { useState } from "react"
import { useFieldArray, useFormContext } from "react-hook-form"

export const SendCarouselBlockEditor = ({
  parentName,
}: { parentName: string }) => {
  const [api, setApi] = useState<CarouselApi>()
  const [current, setCurrent] = useState<number>()

  const { control } = useFormContext()
  const { fields, append, update, remove } = useFieldArray({
    control,
    name: parentName,
  })

  const addCard = () => {
    append(sendCardBlockDefaultValue())
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
      <Carousel setApi={setApi} opts={{ dragFree: false }}>
        <CarouselContent>
          {fields.map((field, index) => (
            <CarouselItem className="" key={field.id}>
              <div className="p-1">
                <SendCardBlockEditor
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
              onClick={addCard}
              type="button"
              variant="ghost"
              size="icon"
              className="absolute size-8 shrink-0 top-1/2 right-0 mt-[50px]"
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
                  onClick={removeCard}
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute size-8 shrink-0 top-1/2 right-0 mt-[85px]"
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
                  type="button"
                  variant="ghost"
                  className="absolute size-8 shrink-0 top-3 right-0"
                  onClick={onNext}
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
                  type="button"
                  variant="ghost"
                  className="absolute size-8 shrink-0 top-3 -left-3"
                  onClick={onPrev}
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
