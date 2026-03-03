import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Img,
  Preview,
  Section,
  Tailwind,
  Text,
} from "@react-email/components"
import type { ReactNode } from "react"
import tailwindConfig from "../tailwind.config"

export type BaseTempateProps = {
  brandName: string
  brandLogoUrl: string
  brandUrl: string
  subject: string
}

function BaseTempate(props: BaseTempateProps & { children: ReactNode }) {
  const { brandName, brandLogoUrl, subject, children } = props

  return (
    <Html>
      <Head />
      <Tailwind config={tailwindConfig}>
        <Body className="mx-auto my-0 bg-white font-slack">
          <Preview>{subject}</Preview>
          <Container className="mx-auto my-0 px-5 py-0">
            <Section className="mt-8">
              <Img alt={brandName} height="45" src={brandLogoUrl} width="75" />
            </Section>
            <Heading className="mx-0 my-[30px] p-0 font-bold text-4xl text-[#1d1c1d] leading-[42px]">
              {subject}
            </Heading>
            {children}
            <Section>
              <Text className="my-0">Sincerely,</Text>
              <Text className="my-0">{brandName} Team</Text>
            </Section>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  )
}

export default BaseTempate
