/** Logo mark for NexusAI auth surfaces — always black on white theme. */
export function NexusLogo({
  size = "md",
}: {
  size?: "sm" | "md" | "lg" | "xl";
}) {
  const box =
    size === "xl"
      ? "h-16 w-16 rounded-2xl text-xl"
      : size === "lg"
        ? "h-14 w-14 rounded-2xl text-lg"
        : size === "sm"
          ? "h-8 w-8 rounded-lg text-xs"
          : "h-10 w-10 rounded-xl text-sm";

  return (
    <div
      className={`flex shrink-0 items-center justify-center bg-zinc-950 font-bold text-white shadow-[0_4px_20px_-4px_rgba(0,0,0,0.25)] ${box}`}
    >
      N
    </div>
  );
}
