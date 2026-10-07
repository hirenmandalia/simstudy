import { handle, UserFacingError } from "@/lib/http";
import { requireUser } from "@/lib/session";
import { getProject, newId, now, saveUpload, updateProject } from "@/lib/store";
import { checkScreen } from "@/agent/screenCheck";
import { agentEvent, assertNotRunning, audit, withdrawDesignApproval } from "@/lib/review";
import { prepareScreenshot } from "@/lib/images";
import { emptyUsage, mergeUsage, toClientProject, type Screen } from "@/lib/types";

export const maxDuration = 120;

const TYPES: Record<string, { ext: string; mediaType: Screen["mediaType"] }> = {
  "image/png": { ext: "png", mediaType: "image/png" },
  "image/jpeg": { ext: "jpg", mediaType: "image/jpeg" },
  "image/webp": { ext: "webp", mediaType: "image/webp" },
  "image/gif": { ext: "gif", mediaType: "image/gif" },
};
/** Raw upload limit. Images are resized to fit the model's limits after upload. */
const MAX_BYTES = 25 * 1024 * 1024;
const MAX_SCREENS = 20;

/** Upload one or more screenshots. Each is checked for PII / inappropriate content. */
export async function POST(req: Request, ctx: RouteContext<"/api/projects/[id]/screens">) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await ctx.params;
    const form = await req.formData();
    if (form.get("attested") !== "true")
      throw new UserFacingError("Confirm the screenshots are from a public app and that personal data has been redacted or replaced with fictional data.");
    const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
    if (!files.length) throw new UserFacingError("Choose at least one image.");

    const existing = await getProject(user.id, id);
    assertNotRunning(existing);
    if (existing.screens.length + files.length > MAX_SCREENS) throw new UserFacingError(`A study can have at most ${MAX_SCREENS} screens.`);

    const usage = emptyUsage();
    const rejected: string[] = [];
    const accepted = await Promise.all(
      files.map(async (file) => {
        const type = TYPES[file.type];
        if (!type) {
          rejected.push(`${file.name}: only PNG, JPEG, WebP or GIF images are supported.`);
          return null;
        }
        if (file.size > MAX_BYTES) {
          rejected.push(`${file.name}: larger than 25 MB.`);
          return null;
        }
        let prepared;
        try {
          prepared = await prepareScreenshot(Buffer.from(await file.arrayBuffer()), type.mediaType);
        } catch {
          rejected.push(`${file.name}: couldn't read this image file.`);
          return null;
        }
        const data = prepared.data;
        const label = file.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim().slice(0, 80) || "Screen";
        const check = await checkScreen(data, prepared.mediaType, label, usage);
        if (check.inappropriate) {
          rejected.push(`${file.name}: not accepted (${check.inappropriateReason ?? "inappropriate content"}).`);
          return null;
        }
        return { data, type: { ext: prepared.ext, mediaType: prepared.mediaType }, label, check };
      }),
    );

    const { project } = await updateProject(user.id, id, async (p) => {
      assertNotRunning(p);
      const added: string[] = [];
      for (const a of accepted) {
        if (!a) continue;
        const code = `S${p.nextScreenNumber++}`;
        const fileName = `${code}-${newId()}.${a.type.ext}`;
        await saveUpload(user.id, id, fileName, a.data);
        p.screens.push({
          code,
          label: a.label,
          description: a.check.description,
          fileName,
          mediaType: a.type.mediaType,
          order: p.screens.length ? Math.max(...p.screens.map((s) => s.order)) + 1 : 1,
          uploadedAt: now(),
          piiConcerns: a.check.piiConcerns,
          piiAcknowledged: false,
          screenCheck: a.check.status,
        });
        added.push(code);
      }
      if (added.length) {
        audit(p, "pm", "screens_uploaded", added.join(", "));
        agentEvent(p, `PM uploaded screen(s) ${added.join(", ")}.`);
        withdrawDesignApproval(p, `Screens ${added.join(", ")} were added after the design was approved.`);
      }
      if (rejected.length) audit(p, "system", "screens_rejected", rejected.join(" "));
      mergeUsage(p.usage, usage);
    });
    return Response.json({ project: toClientProject(project), rejected });
  });
}

interface ScreenPatch {
  code: string;
  label?: string;
  description?: string;
  order?: number;
  piiAcknowledged?: boolean;
}

/** Edit labels, descriptions, order, PII acknowledgement and the navigation-flow notes. */
export async function PATCH(req: Request, ctx: RouteContext<"/api/projects/[id]/screens">) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await ctx.params;
    const body = (await req.json()) as { screens?: ScreenPatch[]; flowNotes?: string };
    const { project } = await updateProject(user.id, id, (p) => {
      assertNotRunning(p);
      let structural = false;
      for (const patch of body.screens ?? []) {
        const s = p.screens.find((x) => x.code === patch.code);
        if (!s) throw new UserFacingError(`Unknown screen ${patch.code}`);
        if (typeof patch.label === "string" && patch.label.trim() && patch.label.trim() !== s.label) {
          s.label = patch.label.trim().slice(0, 80);
          structural = true;
        }
        if (typeof patch.description === "string") s.description = patch.description.trim().slice(0, 1000);
        if (typeof patch.order === "number" && patch.order !== s.order) {
          s.order = patch.order;
          structural = true;
        }
        if (typeof patch.piiAcknowledged === "boolean") {
          s.piiAcknowledged = patch.piiAcknowledged;
          if (patch.piiAcknowledged) audit(p, "pm", "screen_pii_acknowledged", s.code);
        }
      }
      if (typeof body.flowNotes === "string" && body.flowNotes !== p.flowNotes) {
        p.flowNotes = body.flowNotes.slice(0, 4000);
        structural = true;
      }
      if (structural) {
        audit(p, "pm", "screens_edited", "labels/order/flow");
        agentEvent(p, "PM edited screen labels, order or navigation-flow notes.");
        withdrawDesignApproval(p, "Screens or the navigation flow changed after the design was approved.");
      }
    });
    return Response.json({ project: toClientProject(project) });
  });
}
