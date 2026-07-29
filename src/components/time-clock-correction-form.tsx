"use client";

import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";

import type { EmployeeScheduleShift } from "@/lib/schedule";

type CorrectionType = "clock_in" | "clock_out" | "full_session";

interface CorrectionRequest {
  id: string;
  businessDate: string;
  requestType: CorrectionType;
  status: "pending" | "approved" | "rejected" | "applied" | "failed";
  requestedClockInAt: string | null;
  requestedClockOutAt: string | null;
  createdAt: string;
}

export function TimeClockCorrectionForm({
  token,
  from,
  to,
  operationalShifts,
}: {
  token: string;
  from: string;
  to: string;
  operationalShifts: EmployeeScheduleShift[];
}) {
  const [open, setOpen] = useState(false);
  const [requestType, setRequestType] = useState<CorrectionType>("clock_in");
  const [businessDate, setBusinessDate] = useState(from);
  const [clockInTime, setClockInTime] = useState("");
  const [clockOutTime, setClockOutTime] = useState("");
  const [pin, setPin] = useState("");
  const [reason, setReason] = useState("");
  const [requests, setRequests] = useState<CorrectionRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const shiftsByDate = useMemo(() => {
    const map = new Map<string, EmployeeScheduleShift[]>();
    for (const shift of operationalShifts) {
      const current = map.get(shift.businessDate) ?? [];
      current.push(shift);
      map.set(shift.businessDate, current);
    }
    return map;
  }, [operationalShifts]);

  useEffect(() => {
    const shifts = shiftsByDate.get(businessDate) ?? [];
    if (shifts.length === 0) return;
    setClockInTime(shifts[0].shiftStart);
    setClockOutTime(shifts[shifts.length - 1].shiftEnd);
  }, [businessDate, shiftsByDate]);

  useEffect(() => {
    loadRequests();
  }, [from, to]);

  async function loadRequests() {
    try {
      const params = new URLSearchParams({ from, to });
      const response = await fetch(`/api/time-clock-corrections/${encodeURIComponent(token)}?${params}`, {
        cache: "no-store",
      });
      if (!response.ok) return;
      const body = await response.json();
      setRequests(Array.isArray(body.requests) ? body.requests : []);
    } catch {
      // The form remains usable if status history is temporarily unavailable.
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch(`/api/time-clock-corrections/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pin,
          businessDate,
          requestType,
          clockInTime: requestType === "clock_out" ? null : clockInTime,
          clockOutTime: requestType === "clock_in" ? null : clockOutTime,
          reason,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "No s'ha pogut enviar.");
      setMessage("Sol.licitud enviada. Queda pendent de revisio.");
      setPin("");
      setReason("");
      await loadRequests();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "No s'ha pogut enviar.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="card correction-card">
      <button type="button" className="correction-toggle" onClick={() => setOpen((value) => !value)}>
        <span>
          <strong>Has oblidat fitxar?</strong>
          <small>Envia una correccio d'entrada o sortida.</small>
        </span>
        <span className="correction-toggle-icon">{open ? "-" : "+"}</span>
      </button>

      {open && (
        <form className="correction-form" onSubmit={submit}>
          <div className="correction-tabs" role="group" aria-label="Tipus de correccio">
            <TypeButton active={requestType === "clock_in"} onClick={() => setRequestType("clock_in")}>
              Entrada
            </TypeButton>
            <TypeButton active={requestType === "clock_out"} onClick={() => setRequestType("clock_out")}>
              Sortida
            </TypeButton>
            <TypeButton active={requestType === "full_session"} onClick={() => setRequestType("full_session")}>
              Jornada
            </TypeButton>
          </div>

          <label>
            Dia
            <input
              type="date"
              min={from}
              max={to}
              value={businessDate}
              onChange={(event) => setBusinessDate(event.target.value)}
              required
            />
          </label>

          <div className="correction-time-grid">
            {requestType !== "clock_out" && (
              <label>
                Hora d'entrada
                <input
                  type="time"
                  value={clockInTime}
                  onChange={(event) => setClockInTime(event.target.value)}
                  required
                />
              </label>
            )}
            {requestType !== "clock_in" && (
              <label>
                Hora de sortida
                <input
                  type="time"
                  value={clockOutTime}
                  onChange={(event) => setClockOutTime(event.target.value)}
                  required
                />
              </label>
            )}
          </div>

          <label>
            Motiu
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Per exemple: he oblidat fitxar en arribar."
              minLength={5}
              maxLength={500}
              required
            />
          </label>

          <label>
            PIN d'empleat
            <input
              type="password"
              inputMode="numeric"
              pattern="[0-9]{4}"
              maxLength={4}
              value={pin}
              onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 4))}
              placeholder="4 numeros"
              required
            />
          </label>

          {message && <p className="form-message success">{message}</p>}
          {error && <p className="form-message error">{error}</p>}

          <button className="correction-submit" type="submit" disabled={loading}>
            {loading ? "Enviant..." : "Enviar per revisar"}
          </button>
        </form>
      )}

      {requests.length > 0 && (
        <div className="correction-history">
          <p className="correction-history-title">Sol.licituds d'aquesta setmana</p>
          {requests.map((item) => (
            <div key={item.id} className="correction-history-row">
              <span>{formatShortDate(item.businessDate)} - {typeLabel(item.requestType)}</span>
              <Status status={item.status} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function TypeButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button type="button" className={active ? "active" : ""} onClick={onClick}>
      {children}
    </button>
  );
}

function Status({ status }: { status: CorrectionRequest["status"] }) {
  const labels: Record<CorrectionRequest["status"], string> = {
    pending: "Pendent",
    approved: "Aprovada",
    rejected: "Rebutjada",
    applied: "Aplicada",
    failed: "Revisar",
  };
  return <span className={`correction-status ${status}`}>{labels[status]}</span>;
}

function typeLabel(value: CorrectionType) {
  if (value === "clock_in") return "Entrada";
  if (value === "clock_out") return "Sortida";
  return "Jornada";
}

function formatShortDate(value: string) {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}
