import { Trophy } from "lucide-react";
import { LEVEL_LABELS, type SellfyLevel } from "@/lib/rewards/api";
import { cn } from "@/lib/utils";

const styles: Record<SellfyLevel, string> = {
  level_0: "bg-secondary text-secondary-foreground border-border",
  level_1: "bg-primary/10 text-primary border-primary/30",
  level_2: "bg-primary/20 text-primary border-primary/50",
  level_3: "gradient-gold text-primary-foreground border-transparent",
};

interface Props {
  level: SellfyLevel;
  className?: string;
}

const LevelBadge = ({ level, className }: Props) => (
  <span
    className={cn(
      "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide",
      styles[level],
      className,
    )}
  >
    {level === "level_3" && <Trophy className="w-3.5 h-3.5" />}
    {level === "level_3" ? "Sellfy Top Seller" : LEVEL_LABELS[level]}
  </span>
);

export default LevelBadge;
