/**
 * Exercise the project store end to end with a throwaway project, then delete it.
 * No AI calls. Runs against whichever backend STORE_BACKEND selects:
 *
 *   npm run store:check                 (local files)
 *   npm run store:check:supabase        (Supabase, credentials from .env.development.local)
 */
import assert from "node:assert/strict";
import {
  createProject, createShare, deleteProject, deleteUpload, getProject, listProjects,
  NotFoundError, readUpload, removeShare, resolveShare, saveUpload, updateProject,
} from "@/lib/store";

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

  await step("delete removes project and screens", async () => {
    await rejectsNotFound(getProject(USER, id), "deleted project");
    await assert.rejects(readUpload(USER, id, "S2-check.png"));
  });

  console.log("all store checks passed");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
