export default function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white p-4 rounded-lg shadow-md mb-4">
      <h3 className="text-xl font-semibold mb-2">{title}</h3>
      {children}
    </div>
  );
}