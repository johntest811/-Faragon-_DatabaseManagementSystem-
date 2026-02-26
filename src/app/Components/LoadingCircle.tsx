"use client";

type LoadingCircleProps = {
  label?: string;
  sizeClassName?: string;
  className?: string;
};

export default function LoadingCircle({
  label = "Loading...",
  sizeClassName = "h-8 w-8",
  className = "",
}: LoadingCircleProps) {
  return (
    <div className={`flex flex-col items-center justify-center gap-2 text-gray-500 ${className}`.trim()}>
      <div className={`inline-block animate-spin rounded-full border-2 border-gray-300 border-t-[#8B1C1C] ${sizeClassName}`.trim()} />
      {label ? <span className="text-sm">{label}</span> : null}
    </div>
  );
}
