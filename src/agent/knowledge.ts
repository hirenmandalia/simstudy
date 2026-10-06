import { promises as fs } from "fs";
import path from "path";

const KB_DIR = process.env.KNOWLEDGE_DIR ?? path.join(process.cwd(), "knowledge");

async function readDir(dir: string, prefix = ""): Promise<{ name: string; text: string }[]> {
  let entries: string[] = [];
  try {
    entries = (await fs.readdir(dir)).sort();
  } catch {
    return [];
  }
  const out: { name: string; text: string }[] = [];
  for (const e of entries) {
    const full = path.join(dir, e);
    const stat = await fs.stat(full);
    if (stat.isDirectory()) out.push(...(await readDir(full, `${prefix}${e}/`)));
    else if (e.endsWith(".md") && e !== "README.md") out.push({ name: prefix + e, text: (await fs.readFile(full, "utf8")).trim() });
  }
  return out;
}

/** The reviewed research-guidelines knowledge base, rendered for a system prompt. Stable byte-for-byte while files are unchanged (prompt caching). */
export async function loadKnowledgeBase(only?: string[]): Promise<string> {
  const files = await readDir(KB_DIR);
  const chosen = only ? files.filter((f) => only.some((o) => f.name.startsWith(o))) : files;
  return chosen.map((f) => `<kb_file name="${f.name}">\n${f.text}\n</kb_file>`).join("\n\n");
}
