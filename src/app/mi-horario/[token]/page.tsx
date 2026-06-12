import { redirect } from "next/navigation";

export default async function LegacyEmployeeSchedulePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { token } = await params;
  const query = await searchParams;
  const week = firstValue(query?.week);
  redirect(`/${token}${week ? `?week=${encodeURIComponent(week)}` : ""}`);
}

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
