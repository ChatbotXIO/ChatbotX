"use client"

import {
  Carousel,
  CarouselContent,
  CarouselItem,
} from "@/components/ui/carousel"
import { SendCardBlockViewer } from "@/features/flows/react-flow/blocks/send-card/viewer"
import type { SendCarouselBlockSchema } from "@/features/flows/react-flow/blocks/send-carousel/schema"

export const SendCarouselBlockViewer = ({
  data,
}: { data: SendCarouselBlockSchema }) => {
  return (
    <Carousel className="pointer-events-none">
      <CarouselContent>
        {data.cards.map((card) => (
          <CarouselItem key={card.id}>
            <SendCardBlockViewer data={card} />
          </CarouselItem>
        ))}
      </CarouselContent>
    </Carousel>
  )
}
