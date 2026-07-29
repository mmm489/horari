import Link from "next/link";
import { notFound } from "next/navigation";

import { TimeClockCorrectionForm } from "@/components/time-clock-correction-form";
import { getEmployeeScheduleByToken, type EmployeeScheduleShift } from "@/lib/schedule";
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

  const operationalGroups = groupByDay(data.operationalShifts);
  const contractualGroups = groupByDay(data.contractualShifts);
  const days = Array.from({ length: 7 }, (_, index) => formatIsoDate(addDays(weekStart, index)));
  const operationalMinutes = totalMinutes(data.operationalShifts);
  const contractualMinutes = totalMinutes(data.contractualShifts);
  const overtimeMinutes = calculateOvertimeMinutes(data.operationalShifts, data.contractualShifts);
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

      <section className="stats stats-four">
        <Stat label="Torns" value={String(data.operationalShifts.length)} />
        <Stat label="Operatiu" value={formatDuration(operationalMinutes)} />
        <Stat label="Contractual" value={formatDuration(contractualMinutes)} />
        <Stat label="Hores extra" value={formatDuration(overtimeMinutes)} />
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
        <>
          <ScheduleWeek
            title="Horari operatiu"
            description="Aquest es l'horari real previst que has de seguir."
            days={days}
            groups={operationalGroups}
            kind="operational"
          />
          <ScheduleWeek
            title="Horari contractual"
            description="Distribucio de les teves hores contractades."
            days={days}
            groups={contractualGroups}
            restDays={data.restDays}
            kind="contractual"
          />
          {data.contractualShifts.length === 0 && (
            <section className="notice">
              <strong>Horari contractual pendent.</strong> Les hores operatives es mostren amb normalitat.
            </section>
          )}
        </>
      )}

      <nav className="nav">
        <Link href={`/${token}?week=${previousWeek}`}>Anterior</Link>
        <Link href={`/${token}?week=${nextWeek}`}>Seguent</Link>
      </nav>

      <TimeClockCorrectionForm
        token={token}
        from={from}
        to={to}
        operationalShifts={data.operationalShifts}
      />

      <p className="foot">
        Si veus algun error, parla amb l'encarregat abans del torn.
      </p>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card stat">
      <p className="stat-label">{label}</p>
      <p className="stat-value">{value}</p>
    </div>
  );
}

function ScheduleWeek({
  title,
  description,
  days,
  groups,
  restDays = [],
  kind,
}: {
  title: string;
  description: string;
  days: string[];
  groups: Map<string, EmployeeScheduleShift[]>;
  restDays?: string[];
  kind: "operational" | "contractual";
}) {
  return (
    <section className={`card week ${kind}`}>
      <div className="week-head">
        <h2>{title}</h2>
        <p className="muted">{description}</p>
      </div>
      <div className="days">
        {days.map((day) => {
          const shifts = groups.get(day) ?? [];
          const isRestDay = restDays.includes(day);
          return (
            <div key={day} className="day">
              <div>
                <p className="day-title">{formatWeekday(day)}</p>
                <p className="day-date">{formatDate(day)}</p>
              </div>
              {isRestDay ? (
                <div className="free">Dia de descans</div>
              ) : shifts.length > 0 ? (
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
  );
}

function groupByDay(shifts: EmployeeScheduleShift[]) {
  const groups = new Map<string, EmployeeScheduleShift[]>();
  for (const shift of shifts) {
    const group = groups.get(shift.businessDate) ?? [];
    group.push(shift);
    groups.set(shift.businessDate, group);
  }
  return groups;
}

function totalMinutes(shifts: EmployeeScheduleShift[]) {
  return shifts.reduce((sum, shift) => sum + shiftMinutes(shift.shiftStart, shift.shiftEnd), 0);
}

function calculateOvertimeMinutes(
  operational: EmployeeScheduleShift[],
  contractual: EmployeeScheduleShift[],
) {
  if (contractual.length === 0) return 0;
  const contractualIntervals = contractual.map(absoluteMinuteInterval);

  return operational.reduce((total, shift) => {
    const [start, end] = absoluteMinuteInterval(shift);
    const overlaps = contractualIntervals
      .map(([contractStart, contractEnd]) => [
        Math.max(start, contractStart),
        Math.min(end, contractEnd),
      ] as [number, number])
      .filter(([overlapStart, overlapEnd]) => overlapEnd > overlapStart)
      .sort((a, b) => a[0] - b[0]);
    let covered = 0;
    let current: [number, number] | null = null;
    for (const overlap of overlaps) {
      if (!current || overlap[0] > current[1]) {
        if (current) covered += current[1] - current[0];
        current = [...overlap];
      } else {
        current[1] = Math.max(current[1], overlap[1]);
      }
    }
    if (current) covered += current[1] - current[0];
    return total + end - start - covered;
  }, 0);
}

function absoluteMinuteInterval(shift: EmployeeScheduleShift): [number, number] {
  const dayStart = Date.parse(`${shift.businessDate}T00:00:00Z`) / 60000;
  const [startHour, startMinute] = shift.shiftStart.split(":").map(Number);
  const [endHour, endMinute] = shift.shiftEnd.split(":").map(Number);
  const startValue = dayStart + startHour * 60 + startMinute;
  let endValue = endHour * 60 + endMinute;
  if (endValue <= startHour * 60 + startMinute) endValue += 24 * 60;
  endValue += dayStart;
  return [startValue, endValue];
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
