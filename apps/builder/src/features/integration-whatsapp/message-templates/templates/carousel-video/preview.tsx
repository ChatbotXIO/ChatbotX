import { Button } from "@/components/ui/button"
import {
  Carousel,
  CarouselContent,
  CarouselItem,
} from "@/components/ui/carousel"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { CardContent } from "@/components/ui/card"
import {
  ArrowLeft,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Plus,
} from "lucide-react"
import { useFieldArray, useFormContext } from "react-hook-form"
import { useState } from "react"
import { templateVideoDefaultValue } from "../video/schema"

export const TemplateCarouselVideoPreview = ({
  parentName,
}: {
  parentName: string
}) => {
  const { control } = useFormContext()
  const { fields, append, swap } = useFieldArray({
    control,
    name: `${parentName}.cards`,
  })
  const [current, setCurrent] = useState(0)

  const addCard = () => {
    append(templateVideoDefaultValue)
  }

  const onNext = () => {
    setCurrent((prev) => (prev + 1) % fields.length)
  }

  const onPrev = () => {
    setCurrent((prev) => (prev - 1 + fields.length) % fields.length)
  }

  return (
    <>
      <CardContent className="relative">
        <Carousel
          opts={{
            align: "start",
          }}
          className="w-full"
        >
          <CarouselContent>
            {fields.map((field, index) => (
              <CarouselItem className="" key={field.id}>
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => swap(index, index - 1)}
                          disabled={index === 0}
                        >
                          <ArrowLeft size={25} />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Move Left</p>
                      </TooltipContent>
                    </Tooltip>

                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => swap(index, index + 1)}
                          disabled={index === fields.length - 1}
                        >
                          <ArrowRight size={25} />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Move Right</p>
                      </TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button type="button" variant="ghost" onClick={addCard}>
                          <Plus size={25} />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Add</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </div>
              </CarouselItem>
            ))}
          </CarouselContent>
        </Carousel>

        {fields.length > 1 && (
          <>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  className="absolute size-8 shrink-0 top-1/2 right-0 -translate-y-1/2"
                  disabled={current === fields.length - 1}
                  onClick={onNext}
                >
                  <ChevronRight size={25} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Next</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  className="absolute size-8 shrink-0 top-1/2 -left-0 -translate-y-1/2"
                  disabled={current === 0}
                  onClick={onPrev}
                >
                  <ChevronLeft size={25} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Prev</p>
              </TooltipContent>
            </Tooltip>
          </>
        )}
      </CardContent>
    </>
  )
}
