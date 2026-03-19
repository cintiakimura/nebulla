import type { MindMapData } from "../components/MindMapFromPlan";

export type LockedSummaryQuestion = {
  key: string;
  number: number;
  title: string;
};

export const CORE_LOCKED_QUESTIONS: LockedSummaryQuestion[] = [
  { key: "Objective (Goal + Scope)", number: 1, title: "Objective (Goal + Scope)" },
  { key: "Users & Roles (Actor + Access)", number: 2, title: "Users & Roles (Actor + Access)" },
  { key: "Data & Models (Database Shape)", number: 3, title: "Data & Models (Database Shape)" },
  { key: "Constraints & Edges", number: 4, title: "Constraints & Edges" },
  { key: "Branding System (Full Upload)", number: 5, title: "Branding System (Full Upload)" },
  { key: "Pages & Navigation", number: 6, title: "Pages & Navigation" },
  { key: "Competition Analysis (optional)", number: 7, title: "Competition Analysis (optional)" },
  { key: "Pricing (Suggest how to price – optional)", number: 8, title: "Pricing (Suggest how to price – optional)" },
];

function buildSimpleMindMapFromQuestions(): MindMapData {
  const nodes: MindMapData["nodes"] = [
    { id: "central", label: "Locked Project Spec", type: "central" as const },
    ...CORE_LOCKED_QUESTIONS.map((q, i) => ({
      id: `q-${i + 1}`,
      label: q.title,
      type: "branch" as const,
    })),
  ];
  const edges: MindMapData["edges"] = CORE_LOCKED_QUESTIONS.map((_, i) => ({
    source: "central",
    target: `q-${i + 1}`,
  }));
  return { nodes, edges };
}

export function buildLockedSummaryMarkdown(args: {
  projectId: string;
  specs: Record<string, unknown>;
  brandingAssets: string[];
}): string {
  const { projectId, specs, brandingAssets } = args;
  const mindMap = buildSimpleMindMapFromQuestions();

  const questionSections = CORE_LOCKED_QUESTIONS.map((q) => {
    const raw = specs[q.key];
    const answer = (typeof raw === "string" ? raw : raw != null ? String(raw) : "").trim();
    return `## ${q.number}. ${q.title}\n\n${answer ? answer : "_(not provided yet)_"}\n`;
  }).join("\n");

  const brandingBlock = brandingAssets.length
    ? brandingAssets
        .map((p) => {
          const last = p.split("/").filter(Boolean).pop() ?? p;
          return `- ${last} \`(${p})\``;
        })
        .join("\n")
    : "_(none uploaded yet)_";

  return `# Locked Project Specification – Source of Truth for Code Generation

Project: \`${projectId}\`
Locked at: _generated in-app_

## Branding Assets

${brandingBlock}

## Mind Map (Derived from locked questions)

\`\`\`json
${JSON.stringify(mindMap, null, 2)}
\`\`\`

## Requirements / Answers (8 core questions)

${questionSections.trim()}
`;
}

