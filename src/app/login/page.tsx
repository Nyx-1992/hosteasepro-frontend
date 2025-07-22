"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

// Simulated user roles
const validUsers = {
  "ns.babczyk@live.de": "admin",
  "sn_apt_management@outlook.com": "assistant",
};

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();

    if (validUsers[email]) {
      localStorage.setItem("HEP_user_email", email); // Simulate login session
      router.push("/dashboard");
    } else {
      setError("Invalid email or unrecognized user.");
    }
  };

  return (
    <main className="min-h-screen bg-gray-100 p-10 text-gray-800 flex items-center justify-center">
      <div className="max-w-md w-full bg-white p-8 rounded-lg shadow-md">
        <h1 className="text-3xl font-bold mb-6 text-center">Log In to HostEasePro</h1>
        <form onSubmit={handleLogin} className="space-y-4">
          <input
            type="email"
            placeholder="Email"
            className="w-full px-4 py-2 border border-gray-300 rounded-md"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            type="password"
            placeholder="Password"
            className="w-full px-4 py-2 border border-gray-300 rounded-md"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <button
            type="submit"
            className="w-full bg-blue-600 text-white py-2 rounded-md hover:bg-blue-700"
          >
            Log In
          </button>
        </form>
        <p className="mt-4 text-center text-sm">
          Not registered? <a href="/signup" className="text-blue-600 hover:underline">Sign up here</a>
        </p>
      </div>
    </main>
  );
}