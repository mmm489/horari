import Link from "next/link";
import { notFound } from "next/navigation";

import { getEmployeeScheduleByToken } from "@/lib/schedule";
import {
  addDays,
  formatDashboardDate,
  formatDuration,
  formatIsoDate,
  parseIsoDate,
  shiftMinutes,
  startOfMondayWeek,
  todayIso,
} from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function EmployeeSchedulePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { token } = await params;
  const query = await searchParams;
  const selectedWeek = firstValue(query?.week) ?? todayIso();
  const weekStart = startOfMondayWeek(parseIsoDate(selectedWeek) ?? new Date());
  const weekEnd = addDays(weekStart, 6);
  const from = formatIsoDate(weekStart);
  const to = formatIsoDate(weekEnd);
  const data = await getEmployeeScheduleByToken(token, from, to).catch(() => null);

  if (!data) notFound();

  const shiftGroups = new Map<string, typeof data.shifts>();
  for (const shift of data.shifts) {
    const group = shiftGroups.get(shift.businessDate) ?? [];
    group.push(shift);
    shiftGroups.set(shift.businessDate, group);
  }

  const days = Array.from({ length: 7 }, (_, index) => formatIsoDate(addDays(weekStart, index)));
  const plannedMinutes = data.shifts.reduce((sum, shift) => sum + shiftMinutes(shift.shiftStart, shift.shiftEnd), 0);
  const previousWeek = formatIsoDate(addDays(weekStart, -7));
  const nextWeek = formatIsoDate(addDays(weekStart, 7));

  return (
    <main className="shell">
      <section className="card header">
        <div className="logo">HC</div>
        <div>
          <p className="eyebrow">Hi Cream</p>
          <h1>{data.employee.name}</h1>
          <p className="muted">
            Horari del {formatDate(from)} al {formatDate(to)}
          </p>
        </div>
      </section>

      <section className="stats">
        <div className="card stat">
          <p className="stat-label">Torns</p>
          <p className="stat-value">{data.shifts.length}</p>
        </div>
        <div className="card stat">
          <p className="stat-label">Total setmana</p>
          <p className="stat-value">{formatDuration(plannedMinutes)}</p>
        </div>
      </section>

      {!data.isPublished ? (
        <section className="card week unpublished">
          <div className="week-head">
            <h2>Horari pendent</h2>
            <p className="muted">
              Aquesta setmana encara no esta publicada. L'encarregat esta preparant els torns.
            </p>
          </div>
        </section>
      ) : (
      <section className="card week">
        <div className="week-head">
          <h2>Setmana</h2>
          <p className="muted">Consulta sempre l'horari actualitzat des d'aquest enllac.</p>
        </div>
        <div className="days">
          {days.map((day) => {
            const shifts = shiftGroups.get(day) ?? [];
            return (
              <div key={day} className="day">
                <div>
                  <p className="day-title">{formatWeekday(day)}</p>
                  <p className="day-date">{formatDate(day)}</p>
                </div>
                {shifts.length > 0 ? (
                  <div className="shift-list">
                    {shifts.map((shift) => (
                      <div key={shift.id} className="shift">
                        <p className="shift-time">{shift.shiftStart} - {shift.shiftEnd}</p>
                        <p className="shift-duration">
                          {formatDuration(shiftMinutes(shift.shiftStart, shift.shiftEnd))}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="free">Lliure</div>
                )}
              </div>
            );
          })}
        </div>
      </section>
      )}

      <nav className="nav">
        <Link href={`/${token}?week=${previousWeek}`}>Anterior</Link>
        <Link href={`/${token}?week=${nextWeek}`}>Seguent</Link>
      </nav>

      <p className="foot">
        Si veus algun error, parla amb l'encarregat abans del torn.
      </p>
    </main>
  );
}

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function formatDate(value: string) {
  return formatDashboardDate(value, "ca-ES", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatWeekday(value: string) {
  return formatDashboardDate(value, "ca-ES", { weekday: "long" });
}
