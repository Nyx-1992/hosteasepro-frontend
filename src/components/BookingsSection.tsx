"use client";
import { useEffect, useState } from "react";

interface Booking {
  id: number;
  platform: string;
  guest_name: string;
  check_in: string;
  check_out: string;
  contact_info: string;
  contacted: boolean;
}

export default function BookingsSection() {
  const [bookings, setBookings] = useState<Booking[]>([]);

  useEffect(() => {
    const fetchBookings = async () => {
      try {
        const res = await fetch("https://hosteasepro-backend.vercel.app/bookings");
        const data: Booking[] = await res.json();
        setBookings(data);
      } catch (err) {
        console.error("Failed to fetch bookings", err);
      }
    };
    fetchBookings();
  }, []);

  const toggleContacted = async (id: number) => {
    await fetch(`https://hosteasepro-backend.vercel.app/bookings/${id}`, {
      method: "PATCH",
    });
    setBookings((prev) =>
      prev.map((b) => b.id === id ? { ...b, contacted: !b.contacted } : b)
    );
  };

  return (
    <section className="mt-10">
      <h2 className="text-2xl font-bold text-blue-700 mb-4">📅 Upcoming Bookings</h2>
      {bookings.length === 0 ? (
        <p>No bookings found.</p>
      ) : (
        <div className="space-y-4">
          {bookings.map((booking) => (
            <div key={booking.id} className="border p-4 rounded-md shadow-sm bg-white">
              <p><strong>Platform:</strong> {booking.platform}</p>
              <p><strong>Guest:</strong> {booking.guest_name}</p>
              <p><strong>Check-in:</strong> {booking.check_in}</p>
              <p><strong>Check-out:</strong> {booking.check_out}</p>
              <p><strong>Contact:</strong> {booking.contact_info}</p>
              <label className="flex items-center mt-2">
                <input
                  type="checkbox"
                  checked={booking.contacted}
                  onChange={() => toggleContacted(booking.id)}
                  className="mr-2"
                />
                Customer contacted?
              </label>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}