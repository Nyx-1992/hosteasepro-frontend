export default function BookingsSection() {
  const bookings = [
    {
      platform: "Airbnb",
      guest: "Laura M.",
      checkIn: "2025-07-25",
      checkOut: "2025-07-28",
    },
    {
      platform: "Booking.com",
      guest: "Jacob H.",
      checkIn: "2025-07-30",
      checkOut: "2025-08-03",
    },
  ];

  return (
    <section className="mt-10">
      <h2 className="text-2xl font-bold text-blue-700 mb-4">📅 Upcoming Bookings</h2>
      <div className="space-y-4">
        {bookings.map((booking, index) => (
          <div key={index} className="border p-4 rounded-md shadow-sm bg-white">
            <p><strong>Platform:</strong> {booking.platform}</p>
            <p><strong>Guest:</strong> {booking.guest}</p>
            <p><strong>Check-in:</strong> {booking.checkIn}</p>
            <p><strong>Check-out:</strong> {booking.checkOut}</p>
          </div>
        ))}
      </div>
    </section>
  );
}