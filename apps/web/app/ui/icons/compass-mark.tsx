import { Compass } from "lucide-react";

export function CompassMark() {
  return (
    <span className="inline-flex items-center gap-2 text-sm font-semibold tracking-tight text-foreground">
      <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-border bg-card">
        <Compass className="h-4 w-4" />
      </span>
      <span>Compass</span>
    </span>
  );
}
