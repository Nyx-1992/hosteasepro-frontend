export default function SectionHeader({ text }: { text: string }) {
  return (
    <h2 className="text-2xl font-bold mb-4 text-blue-700">{text}</h2>
  );
}