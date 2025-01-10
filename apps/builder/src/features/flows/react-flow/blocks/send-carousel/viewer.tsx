'use client'

import type { SendCarouselBlockSchema } from "@/features/flows/react-flow/blocks/send-carousel/schema";
import { SendCardBlockViewer } from "@/features/flows/react-flow/blocks/send-card/viewer";

import {
  Carousel,
  CarouselContent,
  CarouselItem,
} from "@/components/ui/carousel";

export const SendCarouselBlockViewer = ({ data }: { data: SendCarouselBlockSchema }) => {
  return (
    <Carousel className="pointer-events-none">
      <CarouselContent >
        {
          data.cards.map((card, idx) => (
            <CarouselItem key={card.id}>
              <SendCardBlockViewer key={idx} data={card} />
            </CarouselItem>
          ))
        }
      </CarouselContent>
    </Carousel>
  )
}
