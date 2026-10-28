/**
 * Manage activation codes (operator only).
 *
 *   npm run codes -- create [--label "who it's for"] [--cap 10] [--days 60]
 *   npm run codes -- list
 *   npm run codes -- disable <id>     (signs the user out; their study is kept)
 *   npm run codes -- enable <id>
 *   npm run codes -- cap <id> <usd>   (raise or lower the AI budget)
 *   npm run codes -- extend <id> <days>
 *
 * `npm run codes` works on the hosted database (Supabase, credentials from
 * .env.development.local); `npm run codes:local` on the local data folder.
 * A new code is printed once. Only its hash is stored, so it can't be shown again.
 */
import { codeStatus, createAccessCode, DEFAULT_CAP_USD, DEFAULT_VALID_DAYS, getCode, listCodes, updateCode } from "@/lib/codes";
import { projectSpendUsd } from "@/lib/budget";
import { getProject, now } from "@/lib/store";

const [command, ...rest] = process.argv.slice(2);

function flag(name: string): string | undefined {
  const i = rest.indexOf(`--${name}`);
  return i >= 0 ? rest[i + 1] : undefined;
}

function positiveNumber(value: string | undefined, what: string): number {
  const n = Number(value);
  if (!value || !Number.isFinite(n) || n <= 0) throw new Error(`${what} must be a positive number.`);
  return n;
}

async function mustGet(id: string | undefined) {
  if (!id) throw new Error("Give the code's id (from `list`).");
  const code = await getCode(id);
  if (!code) throw new Error(`No code with id ${id}.`);
  return code;
}

const day = (iso: string | null) => (iso ? iso.slice(0, 10) : "-");

async function main() {
  switch (command) {
    case "create": {
      const cap = flag("cap") ? positiveNumber(flag("cap"), "--cap") : DEFAULT_CAP_USD;
      const days = flag("days") ? positiveNumber(flag("days"), "--days") : DEFAULT_VALID_DAYS;
      const { code, record } = await createAccessCode({ label: flag("label"), capUsd: cap, days });
      console.log(`\n  ${code}\n`);
      console.log(`id ${record.id} · AI budget $${cap.toFixed(2)} · expires ${day(record.expiresAt)}${record.label ? ` · ${record.label}` : ""}`);
      console.log("Copy the code now: it can't be shown again.");
      break;
    }
    case "list": {
      const codes = await listCodes();
      if (!codes.length) return console.log("No codes yet. Create one with: npm run codes -- create --label \"…\"");
      const rows = await Promise.all(
        codes.map(async (c) => {
          let study = "-";
          let spent = 0;
          if (c.projectId && !c.studyDeletedAt) {
            const p = await getProject(c.id, c.projectId).catch(() => null);
            if (p) {
              study = p.name.slice(0, 30);
              spent = projectSpendUsd(p);
            }
          } else if (c.studyDeletedAt) study = "(deleted)";
          return {
            id: c.id,
            label: (c.label ?? "").slice(0, 20),
            status: codeStatus(c),
            spent: `$${spent.toFixed(2)} / $${c.capUsd.toFixed(2)}`,
            study,
            expires: day(c.expiresAt),
            "last used": day(c.lastUsedAt),
          };
        }),
      );
      console.table(rows);
      break;
    }
    case "disable": {
      const c = await mustGet(rest[0]);
      await updateCode(c.id, { disabledAt: now() });
      console.log(`Disabled ${c.id}. The user is signed out; their study is kept.`);
      break;
    }
    case "enable": {
      const c = await mustGet(rest[0]);
      await updateCode(c.id, { disabledAt: null });
      console.log(`Enabled ${c.id}.`);
      break;
    }
    case "cap": {
      const c = await mustGet(rest[0]);
      const cap = positiveNumber(rest[1], "The budget");
      await updateCode(c.id, { capUsd: cap });
      console.log(`AI budget for ${c.id} is now $${cap.toFixed(2)}.`);
      break;
    }
    case "extend": {
      const c = await mustGet(rest[0]);
      const days = positiveNumber(rest[1], "Days");
      const from = Math.max(Date.now(), new Date(c.expiresAt).getTime());
      const expiresAt = new Date(from + days * 86_400_000).toISOString();
      await updateCode(c.id, { expiresAt });
      console.log(`${c.id} now expires ${day(expiresAt)}.`);
      break;
    }
    default:
      console.log("Usage: npm run codes -- create | list | disable <id> | enable <id> | cap <id> <usd> | extend <id> <days>");
      process.exitCode = command ? 1 : 0;
  }
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => process.exit());
