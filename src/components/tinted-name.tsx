import { cn } from "cn";

export function TintedName({
  name,
  color,
  className,
}: {
  name: string;
  color?: string;
  className?: string;
}) {
  return (
    <span
      className={cn("font-medium", color && "rounded-md px-1.5 py-0.5", className)}
      style={color ? { backgroundColor: `${color}38` } : undefined}
    >
      {name}
    </span>
  );
}
