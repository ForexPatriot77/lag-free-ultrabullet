export type TimeControl = {
  label: string;
  initialTimeMs: number;
  incrementMs: number;
  category: "Hyperbullet" | "Ultrabullet" | "Ultrazerk" | "Psycho";
  ratingPool: string;
  ratingColumn:
    | "hyperbullet_rating" | "ultrabullet_rating" | "ultrazerk_rating"
    | "psycho_3250_rating" | "psycho_1625_rating" | "psycho_812_5_rating"
    | "psycho_406_25_rating" | "psycho_203_125_rating";
};

export const TIME_CONTROLS: readonly TimeControl[] = [
  { label: "30 seconds · Hyperbullet", initialTimeMs: 30000, incrementMs: 0, category: "Hyperbullet", ratingPool: "hyperbullet", ratingColumn: "hyperbullet_rating" },
  { label: "15 seconds · Ultrabullet", initialTimeMs: 15000, incrementMs: 0, category: "Ultrabullet", ratingPool: "ultrabullet", ratingColumn: "ultrabullet_rating" },
  { label: "7.5 seconds · Ultrazerk", initialTimeMs: 7500, incrementMs: 0, category: "Ultrazerk", ratingPool: "ultrazerk", ratingColumn: "ultrazerk_rating" },
  { label: "3.25 seconds · Psycho", initialTimeMs: 3250, incrementMs: 0, category: "Psycho", ratingPool: "psycho_3250", ratingColumn: "psycho_3250_rating" },
  { label: "1.625 seconds · Psycho", initialTimeMs: 1625, incrementMs: 0, category: "Psycho", ratingPool: "psycho_1625", ratingColumn: "psycho_1625_rating" },
  { label: "0.8125 seconds · Psycho", initialTimeMs: 812.5, incrementMs: 0, category: "Psycho", ratingPool: "psycho_812_5", ratingColumn: "psycho_812_5_rating" },
  { label: "0.40625 seconds · Psycho", initialTimeMs: 406.25, incrementMs: 0, category: "Psycho", ratingPool: "psycho_406_25", ratingColumn: "psycho_406_25_rating" },
  { label: "0.203125 seconds · Psycho", initialTimeMs: 203.125, incrementMs: 0, category: "Psycho", ratingPool: "psycho_203_125", ratingColumn: "psycho_203_125_rating" },
] as const;

export function controlLabel(initialTimeMs: number, incrementMs: number): string {
  return TIME_CONTROLS.find((control) =>
    control.initialTimeMs === initialTimeMs && control.incrementMs === incrementMs
  )?.label ?? "Custom";
}

export function ratingColumnForTime(initialTimeMs: number): TimeControl["ratingColumn"] {
  return TIME_CONTROLS.find((control) => control.initialTimeMs === initialTimeMs)?.ratingColumn
    ?? "ultrabullet_rating";
}
