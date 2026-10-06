import { promises as fs } from "fs";
import path from "path";
import { newId, now, saveUpload, updateProject } from "@/lib/store";
import { addDesignVersion, addPersonaVersion, approveDesign, approvePersonas } from "@/lib/review";
import type { PersonaSetInput, StudyDesignInput } from "@/lib/schemas";
import type { Screen, StudyBrief } from "@/lib/types";

/**
 * Fixtures for the fictional "Pantry Pal" recipe app (demo/pantry-pal-mock.html).
 * Every name and detail is invented. Used by the eval runner and the demo seeder.
 */

export const BRIEF: StudyBrief = {
  productName: "Pantry Pal (fictional demo app)",
  productContext: "A consumer recipe app where home cooks browse, save and cook recipes. Most users save recipes with a heart.",
  featureDescription:
    "Collections: after saving a recipe, users can add it to named collections (e.g. Weeknight dinners, Meal prep), create new collections, and share a collection with their household.",
  featureStage: "partially_built",
  decisionToSupport: "launch",
  researchQuestions: [
    "Can users find how to add a saved recipe to a collection and create a new collection?",
    "Do users understand the difference between saving (heart) and adding to a collection?",
    "Is the 'share with household' option clear and trusted?",
  ],
  targetUsers:
    "Home cooks aged 25-55 who save recipes at least weekly; a mix of new and existing app users, including people who plan meals for a household.",
  additionalContext: null,
};

export const SCREENS: { file: string; label: string; description: string }[] = [
  { file: "S1-home.png", label: "Home feed", description: "Home feed with search bar, category chips and recipe cards, each with a heart icon." },
  { file: "S2-recipe-detail.png", label: "Recipe detail", description: "Recipe detail page with hero image, 'Start cooking' primary button, '♡ Save' secondary button and ingredients." },
  { file: "S3-save-sheet.png", label: "Saved sheet", description: "Bottom sheet after saving: 'Saved ♡ — Also add to a collection?' with three collections, '+ New collection' and 'Done'." },
  { file: "S4-profile-collections.png", label: "Profile collections", description: "Profile with a Collections tab showing a grid of collections, one marked shared." },
  { file: "S5-new-collection.png", label: "New collection dialog", description: "Dialog to name a new collection with a 'Share with household' toggle and Cancel/Create buttons." },
];

export const FLOW =
  "S1 Home → tap a recipe card → S2 Recipe detail → tap '♡ Save' → S3 Saved sheet (pick collections or '+ New collection' → S5 New collection dialog) → Done. Collections are also reachable from S4 Profile → Collections tab.";

export const DESIGN: StudyDesignInput = {
  title: "Pantry Pal Collections — launch readiness",
  featureUnderTest: "Adding saved recipes to collections and creating/sharing collections",
  decisionToSupport: "launch",
  researchQuestions: BRIEF.researchQuestions.map((text, i) => ({ id: `RQ${i + 1}`, text, origin: "pm" as const })),
  method: "usability_test",
  methodRationale:
    "The questions are about findability and comprehension of a partially built flow, which a task-based usability test with think-aloud answers best.",
  participantCount: 5,
  sessionLengthMinutes: 30,
  sessionOutline: [
    { title: "Introduction & warm-up", minutes: 5, description: "Context and current saving habits" },
    { title: "Tasks", minutes: 18, description: "Three tasks on the screens" },
    { title: "Debrief", minutes: 7, description: "Impressions, saving vs collections, sharing" },
  ],
  moderatorIntroduction:
    "Thanks for joining. We're testing an app design, not you, so there are no wrong answers. Please think out loud as you go, and be honest: critical feedback is the most useful.",
  warmUpQuestions: ["Tell me about the last time you saved a recipe to make later. Where did you save it?"],
  tasks: [
    {
      id: "TASK1",
      title: "Keep a recipe for later",
      scenario: "You found a chickpea bowl recipe you'd like to make next week. Show me how you'd keep it so you can find it again.",
      successCriteria: "Reaches S3 after saving from S2.",
      startScreen: "S1",
      relatedQuestionIds: ["RQ1", "RQ2"],
    },
    {
      id: "TASK2",
      title: "Group lunch recipes",
      scenario: "You want a place for all the recipes you'd take to work for lunch. Set that up starting from this recipe.",
      successCriteria: "Identifies '+ New collection' on S3 and completes S5.",
      startScreen: "S2",
      relatedQuestionIds: ["RQ1"],
    },
    {
      id: "TASK3",
      title: "Plan with your household",
      scenario: "Your partner also cooks. You'd like them to see the recipes you're planning for dinner parties. What would you do?",
      successCriteria: "Finds the household sharing option (S5 toggle or the shared collection on S3/S4) and explains what it does.",
      startScreen: "S4",
      relatedQuestionIds: ["RQ3"],
    },
  ],
  interviewQuestions: [
    { id: "Q1", question: "In your own words, what's the difference between saving a recipe and adding it to a collection?", probes: ["What made you think that?"], relatedQuestionIds: ["RQ2"] },
    { id: "Q2", question: "What would you expect to happen when you share a collection with your household?", probes: ["What would you want to control?"], relatedQuestionIds: ["RQ3"] },
  ],
  closingRemarks: "That's everything. Thank you, this was really helpful.",
  targetUserAssumptions: ["Participants save recipes at least weekly", "Some plan meals for a household"],
  assumptions: ["Static screens represent the intended flow"],
  missingInputs: [],
  risks: ["Simulated participants may be more articulate than real users", "Static screenshots can't test real interaction details"],
};

const persona = (p: Partial<PersonaSetInput["personas"][number]> & Pick<PersonaSetInput["personas"][number], "id" | "name" | "label">) => ({
  ageRange: "30-39",
  occupation: "Office worker",
  lifeContext: "Cooks most weeknights.",
  goals: ["Find quick dinners"],
  needs: ["Find saved recipes fast"],
  painPoints: ["Loses track of saved recipes"],
  constraints: ["Limited time on weekdays"],
  techSavviness: "medium" as const,
  productFamiliarity: "regular" as const,
  accessibilityConsiderations: null,
  behaviours: ["Skims rather than reads"],
  communicationStyle: "Casual, short sentences",
  relevance: "Core weekly saver",
  ...p,
});

export const PERSONAS: PersonaSetInput = {
  rationale: "Mix of familiarity and household planning to cover all three research questions.",
  coverageNotes: "Covers new and power users and household planners; no persona with visual impairment.",
  personas: [
    persona({ id: "P1", name: "Maya R.", label: "Busy weeknight planner", ageRange: "35-44", occupation: "Nurse (shift work)", productFamiliarity: "regular", relevance: "Saves weekly; plans dinners for a family (RQ1, RQ3)." }),
    persona({ id: "P2", name: "Theo K.", label: "New to the app", ageRange: "25-34", occupation: "Graduate student", productFamiliarity: "never_used", techSavviness: "high", relevance: "Tests first-time comprehension of save vs collections (RQ2)." }),
    persona({ id: "P3", name: "Linda O.", label: "Cautious occasional cook", ageRange: "45-54", occupation: "School administrator", techSavviness: "low", productFamiliarity: "occasional", behaviours: ["Reads labels carefully", "Avoids sharing settings"], relevance: "Probes trust in household sharing (RQ3)." }),
    persona({ id: "P4", name: "Sam P.", label: "Meal-prep power user", ageRange: "25-34", occupation: "Fitness coach", techSavviness: "high", productFamiliarity: "power_user", relevance: "Heavy collection use; stress-tests organisation (RQ1)." }),
    persona({ id: "P5", name: "Priya D.", label: "Household co-planner", ageRange: "30-39", occupation: "Accountant", productFamiliarity: "occasional", relevance: "Plans with a partner; tests sharing expectations (RQ3)." }),
  ],
};

/** Add brief, screens and flow to a project (no AI calls). */
export async function seedBriefAndScreens(userId: string, projectId: string) {
  const dir = path.join(process.cwd(), "demo", "screens");
  const files = await Promise.all(SCREENS.map(async (s) => ({ ...s, data: await fs.readFile(path.join(dir, s.file)) })));
  await updateProject(userId, projectId, async (p) => {
    p.brief = structuredClone(BRIEF);
    p.flowNotes = FLOW;
    for (const f of files) {
      const code = `S${p.nextScreenNumber++}`;
      const fileName = `${code}-${newId()}.png`;
      await saveUpload(userId, projectId, fileName, f.data);
      const screen: Screen = {
        code,
        label: f.label,
        description: f.description,
        fileName,
        mediaType: "image/png",
        order: p.screens.length + 1,
        uploadedAt: now(),
        piiConcerns: [],
        piiAcknowledged: false,
        screenCheck: "passed",
      };
      p.screens.push(screen);
    }
  });
}

/** Add the fixture design and personas, optionally approved. */
export async function seedPlan(userId: string, projectId: string, approve: boolean) {
  await updateProject(userId, projectId, (p) => {
    addDesignVersion(p, structuredClone(DESIGN), "pm", "Seeded fixture");
    if (approve) approveDesign(p);
    addPersonaVersion(p, structuredClone(PERSONAS), "pm", "Seeded fixture");
    if (approve) approvePersonas(p);
  });
}
