'use client'

import type { CarouselBlockSchema } from "@/features/flows/react-flow/blocks/schema";
import { CardBlockViewer } from "@/features/flows/react-flow/blocks/card/viewer";

import {
  Carousel,
  CarouselContent,
  CarouselItem,
} from "@/components/ui/carousel"

export const CarouselBlockViewer = ({ data }: { data: CarouselBlockSchema }) => {
  return (
    <Carousel className="pointer-events-none">
      <CarouselContent >
        {
          data.cards.map((card, idx) => (
            <CarouselItem key={card.id}>
              <CardBlockViewer key={idx} data={card} />
            </CarouselItem>
          ))
        }
      </CarouselContent>
    </Carousel>
  )
}
