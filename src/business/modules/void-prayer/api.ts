export interface VoidPrayerState extends Record<string, unknown> {
  date: string;
  dailyUsed: number;
  permanentExtra: number;
  temporaryExtra: number;
  temporaryDate: string;
  consumableExtra: number;
  costReduction: number;
}

export type VoidPrayerStatus = Readonly<
  VoidPrayerState & { dailyLimit: number; remaining: number }
>;
export interface VoidPrayerApi {
  status(uid: number): Promise<VoidPrayerStatus>;
}
