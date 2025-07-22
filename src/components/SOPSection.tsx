"use client";
import { useState } from "react";

const defaultSOPs = [
  { id: 1, title: "Guest check-in procedure", category: "Operations" },
  { id: 2, title: "Weekly cleaning checklist", category: "Cleaning" },
  { id: 3, title: "Emergency response protocol", category: "Safety" },
];

export default function SOPSection() {
  const [query, setQuery] = useState("");

  const filteredSOPs = defaultSOPs.filter((sop) =>
    sop.title.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <section className="mt-10">
      <h2 className="text-2xl font-bold text-blue-700 mb-4">📚 SOP Library</h2>
      <input
        type="text"
        placeholder="Search SOPs..."
        className="w-full mb-4 px-4 py-2 border border-gray-300 rounded-md"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <ul className="space-y-3">
        {filteredSOPs.map((sop) => (
          <li key={sop.id} className="bg-white p-4 rounded-md shadow-sm">
            <p className="font-semibold">{sop.title}</p>
            <p className="text-sm text-gray-500">{sop.category}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}