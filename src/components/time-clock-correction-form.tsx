"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";

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

interface TimeClockIncident {
  id: string;
  scheduleShiftId: string;
  businessDate: string;
  requestType: CorrectionType;
  shiftStart: string;
  shiftEnd: string;
  suggestedClockInTime: string | null;
  suggestedClockOutTime: string | null;
}

export function TimeClockCorrectionForm({
  token,
  from,
  to,
}: {
  token: string;
  from: string;
  to: string;
}) {
  const [open, setOpen] = useState(false);
  const [incidents, setIncidents] = useState<TimeClockIncident[]>([]);
  const [selectedIncidentId, setSelectedIncidentId] = useState("");
  const [clockInTime, setClockInTime] = useState("");
  const [clockOutTime, setClockOutTime] = useState("");
  const [pin, setPin] = useState("");
  const [reason, setReason] = useState("");
  const [requests, setRequests] = useState<CorrectionRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedIncident = useMemo(
    () => incidents.find((item) => item.id === selectedIncidentId) ?? null,
    [incidents, selectedIncidentId],
  );
  const missingPunches = incidents.reduce(
    (total, incident) => total + (incident.requestType === "full_session" ? 2 : 1),
    0,
  );

  useEffect(() => {
    if (!selectedIncident) return;
    setClockInTime(selectedIncident.suggestedClockInTime ?? "");
    setClockOutTime(selectedIncident.suggestedClockOutTime ?? "");
  }, [selectedIncident]);

  useEffect(() => {
    loadData();
  }, [from, to]);

  async function loadData() {
    try {
      const today = madridDateOnly();
      const params = new URLSearchParams({
        from: addDateDays(today, -31),
        to: today,
      });
      const response = await fetch(`/api/time-clock-corrections/${encodeURIComponent(token)}?${params}`, {
        cache: "no-store",
      });
      if (!response.ok) return;
      const body = await response.json();
      setRequests(Array.isArray(body.requests) ? body.requests : []);
      const nextIncidents: TimeClockIncident[] = Array.isArray(body.incidents) ? body.incidents : [];
      setIncidents(nextIncidents);
      setSelectedIncidentId((current) => (
        nextIncidents.some((item: TimeClockIncident) => item.id === current)
          ? current
          : nextIncidents[0]?.id ?? ""
      ));
      if (nextIncidents.length > 0) setOpen(true);
    } catch {
      // The schedule remains visible if incident history is temporarily unavailable.
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setMessage(null);
    setError(null);
    try {
      if (!selectedIncident) throw new Error("Selecciona un fitxatge pendent.");
      const response = await fetch(`/api/time-clock-corrections/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pin,
          scheduleShiftId: selectedIncident.scheduleShiftId,
          businessDate: selectedIncident.businessDate,
          requestType: selectedIncident.requestType,
          clockInTime: selectedIncident.requestType === "clock_out" ? null : clockInTime,
          clockOutTime: selectedIncident.requestType === "clock_in" ? null : clockOutTime,
          reason,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "No s'ha pogut enviar.");
      setMessage("Sol.licitud enviada. Queda pendent de revisio.");
      setPin("");
      setReason("");
      await loadData();
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
          <strong>
            {incidents.length > 0
              ? `Fitxatges pendents (${missingPunches})`
              : "Fitxatges al dia"}
          </strong>
          <small>
            {incidents.length > 0
              ? "El sistema ha detectat fitxatges que falten."
              : "No hi ha incidencies detectades."}
          </small>
        </span>
        <span className="correction-toggle-icon">{open ? "-" : "+"}</span>
      </button>

      {open && incidents.length > 0 && (
        <form className="correction-form" onSubmit={submit}>
          <div className="incident-options" role="listbox" aria-label="Fitxatges pendents">
            {incidents.map((incident) => (
              <button
                key={incident.id}
                type="button"
                role="option"
                aria-selected={incident.id === selectedIncidentId}
                className={`incident-option${incident.id === selectedIncidentId ? " active" : ""}`}
                onClick={() => setSelectedIncidentId(incident.id)}
              >
                <span className="incident-option-main">
                  <strong>{incidentLabel(incident.requestType)}</strong>
                  <span>{formatShortDate(incident.businessDate)}</span>
                </span>
                <span className="incident-option-time">
                  Horari {incident.shiftStart.slice(0, 5)} - {incident.shiftEnd.slice(0, 5)}
                </span>
              </button>
            ))}
          </div>

          {selectedIncident && (
            <p className="incident-summary">
              Correccio per al {formatShortDate(selectedIncident.businessDate)}.
              Revisa l'hora proposada abans d'enviar-la.
            </p>
          )}

          <div className="correction-time-grid">
            {selectedIncident?.requestType !== "clock_out" && (
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
            {selectedIncident?.requestType !== "clock_in" && (
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

      {open && incidents.length === 0 && (
        <p className="correction-empty">
          No tens cap fitxatge pendent de corregir.
        </p>
      )}

      {requests.length > 0 && (
        <div className="correction-history">
          <p className="correction-history-title">Sol.licituds recents</p>
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

function incidentLabel(value: CorrectionType) {
  if (value === "clock_in") return "Falta l'entrada";
  if (value === "clock_out") return "Falta la sortida";
  return "Falten l'entrada i la sortida del torn";
}

function formatShortDate(value: string) {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

function madridDateOnly() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function addDateDays(value: string, amount: number) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + amount));
  return date.toISOString().slice(0, 10);
}
