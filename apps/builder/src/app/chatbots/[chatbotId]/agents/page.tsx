"use client";
import React from "react";
import { AgentTable } from "@/app/features/agents/agent-table";
import { AgentBreadcumb } from "@/app/features/agents/agent-breadcumb";

const data = [
  {
    id: 1,
    name: "Cosiman Cosime",
    avatar: "C",
    contacts: true,
    analytics: true,
    flows: true,
    settings: true,
    notifications: false,
  },
  {
    id: 2,
    name: "My Hoang Phan Truong",
    avatar: "T",
    contacts: true,
    analytics: true,
    flows: true,
    settings: true,
    notifications: true,
  },
  {
    id: 3,
    name: "Nhường Phạm",
    avatar: "N",
    contacts: true,
    analytics: true,
    flows: true,
    settings: true,
    notifications: true,
  },
  {
    id: 4,
    name: "Bùi Văn Gia Phát",
    avatar: "P",
    contacts: true,
    analytics: true,
    flows: true,
    settings: true,
    notifications: true,
  },
];

export default function AgentsPage({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { chatbotId: string };
}) {
  return (
    <div className="absolute lg:left-1/3">
      <AgentBreadcumb chatbotId={params.chatbotId} />
      <AgentTable data={data} />  
    </div>
  );
}
