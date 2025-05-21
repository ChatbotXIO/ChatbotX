"use client"

import {
  Carousel,
  CarouselContent,
  CarouselItem,
} from "@/components/ui/carousel"
import { SendCardStepViewer } from "@/features/flows/react-flow/steps/send-card/viewer"
import type { SendCarouselStepSchema } from "@ahachat.ai/flow-config"

export const SendCarouselStepViewer = ({
  data,
}: {
  data: SendCarouselStepSchema
}) => {
  return (
    <Carousel className="pointer-events-none">
      <CarouselContent>
        {data.cards.map((card) => (
          <CarouselItem key={card.id}>
            <SendCardStepViewer data={card} />
          </CarouselItem>
        ))}
      </CarouselContent>
    </Carousel>
  )
}
