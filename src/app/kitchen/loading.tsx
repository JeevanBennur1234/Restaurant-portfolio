import { Skeleton } from "@/components/ui/skeleton";

export default function KitchenLoading() {
  return (
    <div className="min-h-screen bg-[#110F0E] text-white flex flex-col overflow-hidden">
      <div className="h-16 bg-[#161412] border-b border-[#2C2825] px-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-lg bg-zinc-800" />
          <div className="space-y-1.5">
            <Skeleton className="h-5 w-32 bg-zinc-800" />
            <Skeleton className="h-3 w-24 bg-zinc-800" />
          </div>
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-24 rounded-md bg-zinc-800" />
          <Skeleton className="h-9 w-24 rounded-md bg-zinc-800" />
        </div>
      </div>

      <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-4 p-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="flex flex-col rounded-xl bg-[#171513] border border-[#26221E] p-3 space-y-3"
          >
            <Skeleton className="h-8 w-full rounded-md bg-zinc-800" />
            <Skeleton className="h-44 w-full rounded-xl bg-zinc-800/60" />
            <Skeleton className="h-44 w-full rounded-xl bg-zinc-800/60" />
          </div>
        ))}
      </div>
    </div>
  );
}
