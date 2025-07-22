"use client";
import { useState } from "react";
import BookingsSection from "../../components/BookingsSection";
import TaskSection from "../../components/TaskSection";
import SOPSection from "../../components/SOPSection";
import CalendarSyncSection from "../../components/CalendarSyncSection";


export default function DashboardPage() {
  const [email, setEmail] = useState<string>("");

  return (
    <main className="p-6">
      <h1 className="text-3xl font-bold text-blue-800 mb-6">📊 HostEasePro Dashboard</h1>
      <BookingsSection />
      <TaskSection role="admin" />
      <SOPSection />
      <CalendarSyncSection />
    </main>
  );
}