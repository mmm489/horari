import { Pool } from "pg";

type DbRow = Record<string, unknown>;

export interface Employee {
  id: string;
  name: string;
}

export interface EmployeeScheduleShift {
  id: string;
  employeeId: string;
  employeeName: string;
  businessDate: string;
  shiftStart: string;
  shiftEnd: string;
}

let pool: Pool | null = null;

function getDatabaseUrl() {
  return process.env.HORARI_DATABASE_URL
    || process.env.DASHBOARD_DATABASE_URL
    || process.env.POSTGRES_URL
    || "";
}

function getPool() {
  const connectionString = getDatabaseUrl();
  if (!connectionString) {
    throw new Error("Falta HORARI_DATABASE_URL.");
  }

  if (!pool) {
    pool = new Pool({
      connectionString,
      max: 3,
      ssl: connectionString.includes("sslmode=require") ? undefined : { rejectUnauthorized: false },
    });
  }
  return pool;
}

async function query<T extends DbRow = DbRow>(text: string, values: unknown[] = []) {
  const result = await getPool().query<T>(text, values);
  return result.rows;
}

async function hasTable(schema: string, table: string) {
  const rows = await query(
    `
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = $1
        AND table_name = $2
      LIMIT 1
    `,
    [schema, table],
  );
  return rows.length > 0;
}

export async function getEmployeeScheduleByToken(token: string, from: string, to: string) {
  if (!token || !/^[a-zA-Z0-9_-]{20,100}$/.test(token)) return null;
  const apiData = await getEmployeeScheduleFromApi(token, from, to);
  if (apiData) return apiData;

  const linkRows = await query<{ employee_id: string; token: string }>(
    `
      SELECT employee_id, token
      FROM employee_schedule_links
      WHERE token = $1
      LIMIT 1
    `,
    [token],
  );
  const link = linkRows[0];
  if (!link) return null;

  const employee = await findEmployee(String(link.employee_id));
  if (!employee) return null;

  const shiftRows = await query(
    `
      SELECT id, employee_id, business_date, shift_start, shift_end
      FROM employee_schedule_shifts
      WHERE employee_id = $1
        AND business_date >= $2::date
        AND business_date <= $3::date
      ORDER BY business_date ASC, shift_start ASC
    `,
    [employee.id, from, to],
  );

  return {
    employee,
    shifts: shiftRows.map((row) => mapShift(row, employee.name)),
  };
}

async function getEmployeeScheduleFromApi(token: string, from: string, to: string) {
  const baseUrl = process.env.HORARI_API_BASE_URL?.replace(/\/+$/, "");
  if (!baseUrl) return null;

  const url = new URL(`/api/public-schedule/${encodeURIComponent(token)}`, baseUrl);
  url.searchParams.set("from", from);
  url.searchParams.set("to", to);

  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    next: { revalidate: 0 },
  });
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`No se ha podido cargar el horario (${response.status}).`);
  }

  const data = await response.json() as {
    employee?: Employee;
    shifts?: EmployeeScheduleShift[];
  };
  if (!data.employee || !Array.isArray(data.shifts)) return null;

  return {
    employee: data.employee,
    shifts: data.shifts,
  };
}

async function findEmployee(employeeId: string): Promise<Employee | null> {
  if (await hasTable("pos", "employees")) {
    const rows = await query<{ id: string; name: string }>(
      `
        SELECT id::text AS id, name
        FROM pos.employees
        WHERE id::text = $1
        LIMIT 1
      `,
      [employeeId],
    );
    if (rows[0]) return { id: String(rows[0].id), name: String(rows[0].name) };
  }

  if (await hasTable("public", "employees")) {
    const rows = await query<{ id: string; name: string }>(
      `
        SELECT id::text AS id, name
        FROM employees
        WHERE id::text = $1
        LIMIT 1
      `,
      [employeeId],
    );
    if (rows[0]) return { id: String(rows[0].id), name: String(rows[0].name) };
  }

  return { id: employeeId, name: "Empleat" };
}

function mapShift(row: DbRow, employeeName: string): EmployeeScheduleShift {
  return {
    id: String(row.id),
    employeeId: String(row.employee_id),
    employeeName,
    businessDate: normalizeDate(row.business_date),
    shiftStart: String(row.shift_start),
    shiftEnd: String(row.shift_end),
  };
}

function normalizeDate(value: unknown) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const str = String(value);
  return str.length >= 10 ? str.slice(0, 10) : str;
}
