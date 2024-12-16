"use client";
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { ArrowDown, Facebook } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

type country = {
    name: string,
    value: string,
}

const Channels = () => {

    const arrCountries: country[] = [
        { name: "Unknown", value: "unknown" },
        { name: "Afrikaans", value: "afrikaans" },
        { name: "Arabic", value: "arabic" },
        { name: "Bengali", value: "bengali" },
        { name: "English US", value: "engUs" },
        { name: "Vietnamese", value: "Vietnamese" }
    ]

    return (
        <div>
            <Accordion type="single" collapsible style={{ width: '100%' }}>
                <AccordionItem value="item-1">
                    <AccordionTrigger>
                        <div className="flex justify-center content-center">
                            <Facebook className="text-blue-500 mr-10" /> Facebook Messenger
                        </div>
                    </AccordionTrigger>
                    <AccordionContent>
                        <Card className="md:grid md:grid-cols-12">
                            <CardHeader className="col-span-3">
                                <CardTitle>Target country</CardTitle>
                                <CardDescription>Card Description</CardDescription>
                            </CardHeader>
                            <CardContent className="col-span-4 flex justify-center items-center">
                                <Select>
                                    <SelectTrigger className="w-full">
                                        <SelectValue placeholder="English US" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectGroup>
                                            {
                                                (arrCountries || []).map((country) => {
                                                    return (
                                                        <SelectItem value={country.value}>{country.name}</SelectItem>
                                                    )
                                                })
                                            }
                                        </SelectGroup>
                                    </SelectContent>
                                </Select>
                            </CardContent>
                            <CardFooter className="col-span-5">
                                <p className="text-[#6c757d] text-base">
                                    The country where most of your contacts live. The bot automatically adds the country code to a phone number shared by your contacts to make it a valid WhatsApp or SMS contact.
                                </p>
                            </CardFooter>
                        </Card>
                    </AccordionContent>
                </AccordionItem>

                <AccordionItem value="item-2">

                </AccordionItem>

                <AccordionItem value="item-3">

                </AccordionItem>
            </Accordion></div>
    )
}

export default Channels