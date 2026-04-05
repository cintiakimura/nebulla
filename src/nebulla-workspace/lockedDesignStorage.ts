const KEY = "nebulla_locked_ui_design_v1";

export type LockedWorkspaceDesignV1 = {
  v: 1;
  svg: string;
  lockedAt: string;
  planFingerprint: string;
};

export function fingerprintWorkspacePlan(planText: string): string {
  let h = 0;
  for (let i = 0; i < planText.length; i++) {
    h = (Math.imul(31, h) + planText.charCodeAt(i)) | 0;
  }
  return String(h);
}

export function saveLockedWorkspaceDesign(svg: string, planText: string): void {
  try {
    const payload: LockedWorkspaceDesignV1 = {
      v: 1,
      svg,
      lockedAt: new Date().toISOString(),
      planFingerprint: fingerprintWorkspacePlan(planText),
    };
    localStorage.setItem(KEY, JSON.stringify(payload));
  } catch {
    /* quota / private mode */
  }
}

export function loadLockedWorkspaceDesign(): LockedWorkspaceDesignV1 | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<LockedWorkspaceDesignV1>;
    if (p.v !== 1 || typeof p.svg !== "string" || !p.svg.trim()) return null;
    return p as LockedWorkspaceDesignV1;
  } catch {
    return null;
  }
}

/** Short directive for future Builder / agent prompts (read by app code). */
export function lockedDesignSystemDirective(): string {
  const d = loadLockedWorkspaceDesign();
  if (!d) return "";
  return (
    `[LOCKED NEBULLA UI SYSTEM] A high-fidelity workspace mockup was locked on ${d.lockedAt}. ` +
    `All new pages and components must follow the same dark cyan glass IDE language (panels, typography density, accent color).`
  );
}
