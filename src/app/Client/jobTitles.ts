import type { SupabaseClient } from "@supabase/supabase-js";

export type JobTitleRow = { title_id: string | number; title: string; is_active: boolean };

export function normalizeJobTitle(value: string) {
  return value.trim().replace(/\s+/g, " ").toUpperCase();
}

function catalogError(error: { code?: string; message: string }) {
  if (["42P01", "42703", "PGRST204", "PGRST205"].includes(error.code ?? "")) {
    return new Error("Job title setup is missing. Ask your administrator to run SQL/supabase_fix_job_title_catalog.sql, then reopen this form.");
  }
  if (["42501", "PGRST116"].includes(error.code ?? "")) {
    return new Error("The job title change was not saved. Check your Applicants or Employees write permission and reload the form.");
  }
  return new Error(`Job title catalog: ${error.message}`);
}

export async function loadJobTitles(client: SupabaseClient): Promise<JobTitleRow[]> {
  const rows: JobTitleRow[] = [];
  for (let offset = 0; ; offset += 500) {
    const result = await client.from("job_titles").select("title_id,title,is_active")
      .order("title_id").range(offset, offset + 499);
    if (result.error) throw catalogError(result.error);
    const batch = result.data as JobTitleRow[];
    rows.push(...batch);
    if (batch.length < 500) break;
  }
  return rows.sort((a, b) => a.title.localeCompare(b.title));
}

export async function saveJobTitle(client: SupabaseClient, value: string): Promise<JobTitleRow> {
  const title = normalizeJobTitle(value);
  if (!title) throw new Error("Enter a job title first.");
  const rows = await loadJobTitles(client);
  const matches = rows.filter((row) => normalizeJobTitle(row.title) === title);
  const existing = matches.find((row) => row.is_active) ?? matches[0];
  if (existing?.is_active) return existing;
  const query = existing
    ? client.from("job_titles").update({ is_active: true }).eq("title_id", existing.title_id)
    : client.from("job_titles").insert({ title, is_active: true });
  const result = await query.select("title_id,title,is_active").single();
  if (result.error) {
    // Another editor may have created/reactivated the same title meanwhile.
    if (result.error.code === "23505") {
      const winner = (await loadJobTitles(client)).find((row) => row.is_active && normalizeJobTitle(row.title) === title);
      if (winner) return winner;
    }
    throw catalogError(result.error);
  }
  return result.data as JobTitleRow;
}

export async function removeJobTitle(client: SupabaseClient, id: string | number): Promise<void> {
  const result = await client.from("job_titles").update({ is_active: false })
    .eq("title_id", id).select("title_id").single();
  if (result.error) throw catalogError(result.error);
}
