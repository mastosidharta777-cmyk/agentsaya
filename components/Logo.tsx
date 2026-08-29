export function Logo({ className = "text-2xl" }: { className?: string }) {
  return (
    <div className={`font-sans font-bold tracking-tight inline-flex items-center select-none ${className}`}>
      <span className="text-[#064E3B] dark:text-emerald-500 font-extrabold">Agent</span>
      <span className="text-[#10B981] font-medium ml-1">Saya</span>
      <span className="w-2 h-2 rounded-full bg-[#10B981] ml-1 self-end mb-1"></span>
    </div>
  );
}
