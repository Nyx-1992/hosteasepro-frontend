"use client";
import { useEffect, useState } from "react";

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

  );
}