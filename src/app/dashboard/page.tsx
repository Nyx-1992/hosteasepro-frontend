"use client";
import { useEffect, useState } from "react";
import BookingsSection from "@/components/BookingsSection";

const roleMap: Record<string, "admin" | "assistant"> = {
  "ns.babczyk@live.de": "admin",
  "sn_apt_management@outlook.com": "assistant",
};

export default function DashboardPage() {
  const [email, setEmail] = useState<string | null>(null);
  const [role, setRole] = useState<"admin" | "assistant" | null>(null);

  useEffect(() => {
    const storedEmail = localStorage.getItem("HEP_user_email");
    if (storedEmail && roleMap[storedEmail]) {
      setEmail(storedEmail);
      setRole(roleMap[storedEmail]);
    }
  }, []);

  if (!email || !role) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gray-100 text-gray-700">
        <p className="text-xl">Please log in first to view your dashboard.</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-white p-10 text-gray-800">
      <h1 className="text-4xl font-bold mb-4">Welcome, {email}</h1>
      <p className="text-lg mb-6">
        You are logged in as:{" "}
        <span className="font-semibold text-blue-600">{role.toUpperCase()}</span>
      </p>

      {role === "admin" ? (
        <>
          <section className="mb-10">
            <h2 className="text-2xl font-semibold mb-4">Admin Tools</h2>
            <ul className="list-disc ml-6 space-y-2">
              <li>📊 View bookings across platforms</li>
              <li>🛠️ Assign tasks to assistants</li>
              <li>🗂️ Manage SOP library</li>
              <li>🔑 Invite new team members</li>
            </ul>
          </section>
          <BookingsSection />
        </>
      ) : (
        <>
          <section className="mb-10">
            <h2 className="text-2xl font-semibold mb-4">Assistant Dashboard</h2>
            <ul className="list-disc ml-6 space-y-2">
              <li>📋 View assigned tasks</li>
              <li>📚 Access SOPs and checklists</li>
              <li>📅 Sync calendar availability</li>
            </ul>
          </section>
          <BookingsSection />
        </>
      )}
    </main>
  );
}