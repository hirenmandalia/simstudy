/**
 * Exercise the project store end to end with a throwaway project, then delete it.
 * No AI calls. Runs against whichever backend STORE_BACKEND selects:
 *
 *   npm run store:check                 (local files)
 *   npm run store:check:supabase        (Supabase, credentials from .env.development.local)
 */
import assert from "node:assert/strict";
import { promises as fs } from "fs";
import path from "path";
import postgres from "postgres";
import { createClient } from "@supabase/supabase-js";
import { postgresUrl } from "@/lib/store/supabase";
import {
  backend, createProject, createShare, deleteProject, deleteUpload, getProject, getProjectIncludingDeleted, listProjects,
  NotFoundError, readUpload, removeShare, resolveShare, saveUpload, updateProject,
} from "@/lib/store";
import { activeCodeFor, checkCodeEntry, claimCodeStudy, codeStatus, createAccessCode, normalizeCode, updateCode } from "@/lib/codes";

const USER = "ustorecheck01";
const OTHER = "ustorecheck02";

async function rejectsNotFound(p: Promise<unknown>, what: string) {
  await assert.rejects(p, (e) => e instanceof NotFoundError || /not found/i.test(String(e)), what);
}

async function step(name: string, fn: () => Promise<void>) {
  await fn();
  console.log(`ok  ${name}`);
}

async function main() {
  console.log(`backend: ${process.env.STORE_BACKEND ?? "default"}`);
  const project = await createProject(USER, "Store check");
  const id = project.id;
  try {
    await step("create and read back", async () => {
      const p = await getProject(USER, id);
      assert.equal(p.name, "Store check");
      assert.equal(p.brief.researchQuestions.length, 0);
    });

    await step("another user cannot read it", () => rejectsNotFound(getProject(OTHER, id), "cross-user read"));

    await step("20 concurrent updates all land (row lock)", async () => {
      await Promise.all(
        Array.from({ length: 20 }, (_, i) =>
          updateProject(USER, id, async (p) => {
            const n = p.nextScreenNumber;
            await new Promise((r) => setTimeout(r, 5));
            p.nextScreenNumber = n + 1;
            p.flowNotes += `${i},`;
          }),
        ),
      );
      const p = await getProject(USER, id);
      assert.equal(p.nextScreenNumber, 21);
      assert.equal(p.flowNotes.split(",").filter(Boolean).length, 20);
    });

    await step("a failed update writes nothing", async () => {
      await assert.rejects(updateProject(USER, id, (p) => {
        p.name = "should not persist";
        throw new Error("boom");
      }));
      assert.equal((await getProject(USER, id)).name, "Store check");
    });

    await step("list shows it with a stage", async () => {
      const row = (await listProjects(USER)).find((s) => s.id === id);
      assert.ok(row, "project listed");
      assert.equal(row.stage, "Interview");
      assert.ok(!(await listProjects(OTHER)).some((s) => s.id === id), "not listed for another user");
    });

    await step("upload, read, delete a screen", async () => {
      // 1x1 transparent PNG
      const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");
      await saveUpload(USER, id, "S1-check.png", png);
      assert.deepEqual(await readUpload(USER, id, "S1-check.png"), png);
      await rejectsNotFound(readUpload(OTHER, id, "S1-check.png").catch((e) => { throw e?.code === "ENOENT" ? new NotFoundError() : e; }), "cross-user upload read");
      await deleteUpload(USER, id, "S1-check.png");
      await assert.rejects(readUpload(USER, id, "S1-check.png"));
      await saveUpload(USER, id, "S2-check.png", png); // left for deleteProject to clean up
    });

    await step("share link create, resolve, remove", async () => {
      const token = await createShare(USER, id);
      assert.deepEqual(await resolveShare(token), { userId: USER, projectId: id });
      await removeShare(token);
      await rejectsNotFound(resolveShare(token), "removed share");
    });
  } finally {
    await deleteProject(USER, id);
  }

  await step("delete hides the project from users but keeps it and its screens", async () => {
    await rejectsNotFound(getProject(USER, id), "deleted project");
    assert.ok(!(await listProjects(USER)).some((s) => s.id === id), "not listed");
    await rejectsNotFound(updateProject(USER, id, () => {}), "deleted project can't be changed");
    const kept = await getProjectIncludingDeleted(USER, id);
    assert.ok(kept.deletedAt, "kept with deletedAt");
    assert.ok((await readUpload(USER, id, "S2-check.png")).length > 0, "screen kept");
  });

  await step("activation codes: format, entry, one study, disable, expiry", async () => {
    assert.equal(normalizeCode(" sim-abcd-efgh "), "ABCDEFGH");
    assert.equal(normalizeCode("SIM-ABCD-EFG0"), null, "0 is not in the alphabet");
    const ip = `ip:check-${Date.now()}`;
    const { code, record } = await createAccessCode({ label: "store check", capUsd: 1, days: 1 });
    assert.match(code, /^SIM-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/);
    assert.notEqual(record.hash, code, "only a hash is stored");

    const entry = await checkCodeEntry(code.toLowerCase().replace(/-/g, " "), ip);
    assert.ok(entry.ok && entry.code.id === record.id, "code accepted in any case/spacing");
    assert.ok(await activeCodeFor(record.id));

    assert.equal(await claimCodeStudy(record.id, "pcheckstudy1"), true);
    assert.equal(await claimCodeStudy(record.id, "pcheckstudy2"), false, "second study refused");

    await updateCode(record.id, { disabledAt: new Date().toISOString() });
    assert.equal(await activeCodeFor(record.id), null, "disabled code signs out");
    const disabled = await checkCodeEntry(code, ip);
    assert.ok(!disabled.ok && disabled.reason === "disabled");
    await updateCode(record.id, { disabledAt: null, expiresAt: new Date(Date.now() - 1000).toISOString() });
    assert.equal(codeStatus((await backend().getCode(record.id))!), "expired");
    await backend().deleteCode(record.id);
    assert.equal(await backend().getCode(record.id), null);
  });

  await step("activation codes: wrong guesses are rate-limited", async () => {
    const ip = `ip:guess-${Date.now()}`;
    for (let i = 0; i < 8; i++) {
      const r = await checkCodeEntry("SIM-2222-2222", ip);
      assert.ok(!r.ok && r.reason === "invalid", `guess ${i + 1} is invalid`);
    }
    const blocked = await checkCodeEntry("SIM-2222-2222", ip);
    assert.ok(!blocked.ok && blocked.reason === "rate_limited", "9th guess blocked");
  });

  await step("monthly spend ledger adds up", async () => {
    const month = `test-${Date.now()}`;
    await Promise.all([0.5, 0.25, 0.125].map((usd) => backend().addSpend(month, usd)));
    assert.equal(await backend().getSpend(month), 0.875);
    assert.equal(await backend().getSpend(`${month}-none`), 0);
  });

  await purgeCheckData();
  console.log("all store checks passed");
  process.exit(0);
}

/**
 * Studies are never really deleted, so remove this script's own test data
 * (owner "ustorecheck…", "test-…" spend months) to keep it out of real data.
 */
async function purgeCheckData() {
  if (process.env.STORE_BACKEND !== "supabase") {
    const dir = process.env.DATA_DIR ?? "data";
    for (const u of [USER, OTHER]) await fs.rm(path.join(dir, "users", u), { recursive: true, force: true });
    return;
  }
  const sql = postgres(postgresUrl(), { ssl: "require", prepare: false, max: 1 });
  const rows = await sql<{ id: string; owner_id: string }[]>`delete from projects where owner_id like 'ustorecheck%' returning id, owner_id`;
  const screens = createClient(process.env.SUPABASE_URL!, (process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY)!, {
    auth: { persistSession: false },
  }).storage.from("screens");
  for (const r of rows) {
    const prefix = `${r.owner_id}/${r.id}`;
    const { data } = await screens.list(prefix);
    if (data?.length) await screens.remove(data.map((o) => `${prefix}/${o.name}`));
  }
  await sql`delete from app_spend where month like 'test-%'`;
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
