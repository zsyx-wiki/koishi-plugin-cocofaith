export interface DailyPrayerState {
  date: string;
  count: number;
  permanentExtra: number;
  temporaryExtra: number;
  temporaryDate: string;
}

export type DailyPrayerStatus = Readonly<DailyPrayerState & { limit: number; remaining: number }>;
export interface DailyPrayerApi {
  status(uid: number): Promise<DailyPrayerStatus>;
}
