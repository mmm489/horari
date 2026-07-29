import { NextResponse } from "next/server";

const DEFAULT_DASHBOARD_API_BASE_URL = "https://apolodashbprueba.vercel.app";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const incomingUrl = new URL(request.url);
  const target = dashboardUrl(token);
  target.searchParams.set("from", incomingUrl.searchParams.get("from") ?? "");
  target.searchParams.set("to", incomingUrl.searchParams.get("to") ?? "");
  return proxy(target, { method: "GET" });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const body = await request.text();
  return proxy(dashboardUrl(token), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
}

function dashboardUrl(token: string) {
  const baseUrl = (
    process.env.HORARI_API_BASE_URL || DEFAULT_DASHBOARD_API_BASE_URL
  ).replace(/\/+$/, "");
  return new URL(
    `/api/public-schedule/${encodeURIComponent(token)}/time-clock-corrections`,
    baseUrl,
  );
}

async function proxy(url: URL, init: RequestInit) {
  try {
    const response = await fetch(url, { ...init, cache: "no-store" });
    const text = await response.text();
    return new NextResponse(text, {
      status: response.status,
      headers: { "Content-Type": response.headers.get("Content-Type") || "application/json" },
    });
  } catch {
    return NextResponse.json(
      { error: "No s'ha pogut connectar amb el sistema de fitxatge." },
      { status: 503 },
    );
  }
}
