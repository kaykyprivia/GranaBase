export interface BrasilApiHoliday {
  date: string;
  name: string;
  type: string;
}

export function isDateOnHolidayList(dateStr: string, holidays: BrasilApiHoliday[]): BrasilApiHoliday | null {
  return holidays.find((holiday) => holiday.date === dateStr) ?? null;
}
