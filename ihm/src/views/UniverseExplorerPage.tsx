'use client';

export default function UniverseExplorerPage() {
  return (
    <iframe
      src="https://robertsspaceindustries.com/starmap"
      className="h-[calc(100vh-64px)] w-full border-0"
      title="RSI Ark Starmap"
      allowFullScreen
    />
  );
}
