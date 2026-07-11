import { GraduationCap } from "lucide-react";
import {
	EXPERIENCE_LEVELS,
	type ExperienceLevel,
} from "@/lib/codeReviewLevels";
import { cn } from "@/lib/utils";

export function ExperienceLevelPicker({
	value,
	onChange,
	disabled,
	compact = false,
}: {
	value: ExperienceLevel;
	onChange: (level: ExperienceLevel) => void;
	disabled?: boolean;
	compact?: boolean;
}) {
	const active = EXPERIENCE_LEVELS.find((l) => l.value === value);

	if (compact) {
		return (
			<div className="flex flex-wrap items-center gap-2">
				<span className="flex items-center gap-1.5 text-xs text-muted-foreground">
					<GraduationCap className="h-3.5 w-3.5" />
					Review for
				</span>
				<div className="inline-flex flex-wrap gap-1 rounded-xl border border-border bg-muted/30 p-1">
					{EXPERIENCE_LEVELS.map((level) => (
						<button
							key={level.value}
							type="button"
							disabled={disabled}
							title={level.description}
							onClick={() => onChange(level.value)}
							className={cn(
								"rounded-lg px-2.5 py-1 text-xs font-medium transition-colors",
								value === level.value
									? "bg-foreground text-background shadow-sm"
									: "text-muted-foreground hover:bg-background hover:text-foreground",
							)}
						>
							{level.label}
						</button>
					))}
				</div>
			</div>
		);
	}

	return (
		<div className="space-y-2">
			<p className="text-xs text-muted-foreground">{active?.description}</p>
			<div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
				{EXPERIENCE_LEVELS.map((level) => (
					<button
						key={level.value}
						type="button"
						disabled={disabled}
						onClick={() => onChange(level.value)}
						className={cn(
							"rounded-xl border px-3 py-2.5 text-left transition-colors",
							value === level.value
								? "border-foreground bg-foreground text-background"
								: "border-border bg-background hover:bg-muted/40",
						)}
					>
						<p className="text-sm font-semibold">{level.label}</p>
						<p
							className={cn(
								"mt-0.5 text-[11px] leading-snug",
								value === level.value
									? "text-background/75"
									: "text-muted-foreground",
							)}
						>
							{level.description}
						</p>
					</button>
				))}
			</div>
		</div>
	);
}
