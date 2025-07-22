export default function LandingPage() {
  return (
    <main className="min-h-screen bg-gray-100 p-10 text-gray-800">
      <header className="flex justify-between items-center mb-10">
        <h1 className="text-3xl font-bold">HostEasePro</h1>
        <nav>
          <a href="/login" className="mr-4">Login</a>
          <a href="/signup" className="bg-blue-600 text-white px-4 py-2 rounded-md">Sign Up</a>
        </nav>
      </header>

      <section className="text-center mt-20">
        <h2 className="text-4xl font-semibold mb-4">Let the system handle it.</h2>
        <p className="text-lg mb-6">HostEasePro (HEP) is your ultimate tool for automated, stress-free rental management.</p>
        <a href="/signup" className="bg-blue-500 text-white px-6 py-3 rounded-md hover:bg-blue-600">Get Started</a>
      </section>

      <section className="mt-20 text-left">
        <h3 className="text-2xl font-semibold mb-4">Why HEP?</h3>
        <ul className="list-disc ml-6 space-y-2">
          <li>📅 Booking calendar with platform view</li>
          <li>✅ Task manager with seasonal automation</li>
          <li>📚 SOP library for assistants</li>
          <li>🤖 Assistant sync -- HEP keeps you in sync</li>
        </ul>
      </section>
    </main>
  );
}