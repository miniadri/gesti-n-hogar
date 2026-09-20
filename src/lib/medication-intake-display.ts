/**
 * The medication page is a daily view, not a list of every intake generated
 * in advance.  Keep overdue pending doses actionable, show today's doses, and
 * only expose tomorrow as the next planned day.
 */
export function startOfLocalDay(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function medicationIntakeDisplayGroups(intakes: any[], now = new Date()) {
  const todayStart = startOfLocalDay(now);
  const tomorrowStart = new Date(todayStart);
  tomorrowStart.setDate(tomorrowStart.getDate() + 1);
  const dayAfterTomorrowStart = new Date(tomorrowStart);
  dayAfterTomorrowStart.setDate(dayAfterTomorrowStart.getDate() + 1);

  const previousPending: any[] = [];
  const today: any[] = [];
  const tomorrow: any[] = [];

  for (const intake of intakes ?? []) {
    const scheduledAt = new Date(intake.scheduled_for);
    if (Number.isNaN(scheduledAt.getTime())) continue;

    if (scheduledAt < todayStart) {
      if (intake.status === "pending") previousPending.push(intake);
    } else if (scheduledAt < tomorrowStart) {
      today.push(intake);
    } else if (scheduledAt < dayAfterTomorrowStart) {
      tomorrow.push(intake);
    }
  }

  const sortByScheduledFor = (a: any, b: any) =>
    new Date(a.scheduled_for).getTime() - new Date(b.scheduled_for).getTime();

  return {
    previousPending: previousPending.sort(sortByScheduledFor),
    today: today.sort(sortByScheduledFor),
    tomorrow: tomorrow.sort(sortByScheduledFor),
    todayStart,
    tomorrowStart,
  };
}
