"use client";
import { useEffect, useState } from "react";
import BookingsSection from "@/components/BookingsSection";
import TaskSection from "@/components/TaskSection";
import SOPSection from "@/components/SOPSection";
import CalendarSyncSection from "@/components/CalendarSyncSection";

const roleMap: Record<string, "admin" | "assistant"> = {
  "ns.babczyk@live.de": "admin",
  "sn_apt_management@outlook.com": "assistant",
};

export default function DashboardPage() {
  const [email, setEmail] = useState<string