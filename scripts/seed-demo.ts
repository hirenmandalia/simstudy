/**
 * Creates a ready-to-review demo project for a user, without any AI calls:
 * fictional Pantry Pal brief, five demo-safe screens, and the fixture study
 * design + personas awaiting approval. Useful for exploring the approval
 * screens and for a quick demo start.
 *
 *   npm run seed-demo -- <userStorageId>
 *
 * The storage id is the folder name under data/users/ (sign in once first).
 */
import { promises as fs } from "fs";
import path from "path";
import { createProject, newId, now } from "@/lib/store";
import { GREETING } from "@/agent/prompts";
import { seedBriefAndScreens, seedPlan } from "./fixtures";

async function main() {
  let userId = process.argv[2];
  if (!userId) {
    const users = await fs.readdir(path.join(process.env.DATA_DIR ?? "data", "users")).catch(() => []);
    if (users.length !== 1) throw new Error(`Pass a user storage id. Found: ${users.join(", ") || "none (sign in once first)"}`);
    userId = users[0];
  }
  const project = await createProject(userId, "Demo: Pantry Pal collections (seeded)", (p) => {
    p.chat.push({ id: newId("m"), role: "agent", text: GREETING, at: now(), guardrail: null, actions: [] });
  });
  await seedBriefAndScreens(userId, project.id);
  await seedPlan(userId, project.id, false);
  console.log(`Seeded project ${project.id} for user ${userId}. Open /projects/${project.id}`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
