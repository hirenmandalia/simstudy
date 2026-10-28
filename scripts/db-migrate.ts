/**
 * Apply supabase/migrations/*.sql to the Supabase database, in name order,
 * skipping files already applied (tracked in public.app_migrations).
 *
 *   npm run db:migrate      (reads POSTGRES_URL from .env.development.local)
 */
import { promises as fs } from "fs";
import path from "path";
import postgres from "postgres";
import { postgresUrl } from "@/lib/store/supabase";

const DIR = path.join(process.cwd(), "supabase", "migrations");

async function main() {
  const sql = postgres(postgresUrl(), { ssl: "require", prepare: false, max: 1, onnotice: () => {} });
  try {
    await sql`
      create table if not exists public.app_migrations (name text primary key, applied_at timestamptz not null default now())`;
    await sql`alter table public.app_migrations enable row level security`;
    await sql`revoke all on public.app_migrations from anon, authenticated`;
    const done = new Set((await sql<{ name: string }[]>`select name from public.app_migrations`).map((r) => r.name));
    const files = (await fs.readdir(DIR)).filter((f) => f.endsWith(".sql")).sort();
    for (const file of files) {
      if (done.has(file)) {
        console.log(`skip   ${file}`);
        continue;
      }
      const text = await fs.readFile(path.join(DIR, file), "utf8");
      await sql.begin(async (tx) => {
        await tx.unsafe(text);
        await tx`insert into public.app_migrations (name) values (${file})`;
      });
      console.log(`apply  ${file}`);
    }
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
