import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useParams, useNavigate } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import "highlight.js/styles/atom-one-dark.css";
import { buildLockedSummaryMarkdown } from "../lib/buildLockedSummaryMarkdown";
import { getApiBase } from "../lib/api";
import { getUserId } from "../lib/auth";
import { getSessionToken } from "../lib/supabaseAuth";

const MAX_BRANDING_BYTES = 100 * 1024 * 1024;

function parseSpecs(specs: unknown): Record<string, unknown> {
  if (!specs) return {};
  if (typeof specs === "object" && !Array.isArray(specs)) return specs as Record<string, unknown>;
  if (typeof specs === "string") {
    try {
      return JSON.parse(specs || "{}") as Record<string, unknown>;
    } catch (_) {
      return {};
    }
  }
  return {};
}

function parseBrandingAssetsFromProject(project: any, specsObj: Record<string, unknown>): string[] {
  const col = project?.branding_assets;
  if (Array.isArray(col)) return col.filter((x) => typeof x === "string");
  if (typeof col === "string") {
    try {
      const v = JSON.parse(col);
      if (Array.isArray(v)) return v.filter((x) => typeof x === "string");
    } catch (_) {}
  }
  const fallback = specsObj?.__branding_assets;
  if (Array.isArray(fallback)) return fallback.filter((x) => typeof x === "string");
  return [];
}

function parseLockedStateFromProject(project: any, specsObj: Record<string, unknown>): { isLocked: boolean; lockedMd: string } {
  const lockedFromCol = typeof project?.locked_summary_md === "string" ? project.locked_summary_md : "";
  const lockedFromSpecs = typeof specsObj?.__locked_summary_md === "string" ? specsObj.__locked_summary_md : "";
  const lockedMd = lockedFromCol || lockedFromSpecs || "";

  const isLockedCol = project?.brainstorm_complete === true || project?.brainstorm_complete === 1;
  const isLockedSpecs = (specsObj?.__brainstorm_complete as unknown) === true || (specsObj?.__brainstorm_complete as unknown) === 1;
  const isLocked = isLockedCol || isLockedSpecs;
  return { isLocked, lockedMd };
}

export default function LockedSummary() {
  const navigate = useNavigate();
  const { projectId } = useParams<{ projectId: string }>();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [specsObj, setSpecsObj] = useState<Record<string, unknown>>({});
  const [brandingAssets, setBrandingAssets] = useState<string[]>([]);
  const [{ isLocked, lockedMd }, setLockState] = useState<{ isLocked: boolean; lockedMd: string }>({ isLocked: false, lockedMd: "" });

  const [markdownText, setMarkdownText] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const apiBase = getApiBase() || "";

  const refreshMarkdown = (nextSpecsObj: Record<string, unknown>, nextBrandingAssets: string[]) => {
    if (!projectId) return;
    const md = buildLockedSummaryMarkdown({ projectId, specs: nextSpecsObj, brandingAssets: nextBrandingAssets });
    setMarkdownText(md);
  };

  const doLoadProject = async () => {
    if (!projectId) return;
    try {
      setLoading(true);
      setLoadError(null);

      const userId = await getUserId();
      const token = await getSessionToken();
      const headers: Record<string, string> = { Accept: "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;

      const res = await fetch(`${apiBase}/api/users/${userId}/projects/${projectId}`, { headers });
      if (!res.ok) {
        setLoadError(`Could not load project (HTTP ${res.status}).`);
        return;
      }
      const project = await res.json().catch(() => ({}));

      const parsedSpecs = parseSpecs(project?.specs);
      setSpecsObj(parsedSpecs);

      const nextBrandingAssets = parseBrandingAssetsFromProject(project, parsedSpecs);
      setBrandingAssets(nextBrandingAssets);

      const nextLockState = parseLockedStateFromProject(project, parsedSpecs);
      setLockState(nextLockState);

      setMarkdownText(
        nextLockState.lockedMd ||
          buildLockedSummaryMarkdown({
            projectId,
            specs: parsedSpecs,
            brandingAssets: nextBrandingAssets,
          })
      );
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    doLoadProject();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const canEdit = !isLocked;

  const onRefresh = async () => {
    if (!projectId) return;
    if (!apiBase) return;
    await doLoadProject();
    // doLoadProject already sets markdown from fresh parsedSpecs/nextBrandingAssets
    // (state updates are async, so we must not call refreshMarkdown(specsObj, brandingAssets)
    // here—that would use stale closure values).
  };

  const onExport = () => {
    const md = markdownText || "";
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "locked-project-spec.md";
    a.click();
    URL.revokeObjectURL(url);
  };

  const onLock = async () => {
    if (!projectId) return;
    if (saving || isLocked) return;
    setSaving(true);
    setUploadError(null);
    try {
      const userId = await getUserId();
      const token = await getSessionToken();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;

      const nextSpecs: Record<string, unknown> = {
        ...specsObj,
        __locked_summary_md: markdownText,
        __brainstorm_complete: true,
        __branding_assets: brandingAssets,
      };

      const res = await fetch(`${apiBase}/api/users/${userId}/projects/${projectId}`, {
        method: "PUT",
        headers,
        body: JSON.stringify({
          specs: nextSpecs as unknown as Record<string, string>,
          locked_summary_md: markdownText,
          branding_assets: brandingAssets,
          brainstorm_complete: true,
        }),
      });
      if (!res.ok) throw new Error(`Failed to lock summary (HTTP ${res.status}).`);

      setLockState({ isLocked: true, lockedMd: markdownText });
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const uploadBrandingAssets = async (files: File[]) => {
    if (!projectId) return;
    if (!apiBase) return;
    if (files.length === 0) return;
    setUploadError(null);

    const totalBytes = files.reduce((acc, f) => acc + (f.size || 0), 0);
    if (totalBytes > MAX_BRANDING_BYTES) {
      setUploadError(`Branding assets too large. Max total is 100MB, selected ${(totalBytes / 1024 / 1024).toFixed(1)}MB.`);
      return;
    }

    setUploading(true);
    try {
      const userId = await getUserId();
      const token = await getSessionToken();
      const headers: Record<string, string> = {};
      if (token) headers.Authorization = `Bearer ${token}`;

      const fd = new FormData();
      files.forEach((f) => fd.append("files", f, f.name));

      const res = await fetch(`${apiBase}/api/users/${userId}/projects/${projectId}/branding-assets`, {
        method: "POST",
        headers,
        body: fd,
      });
      if (!res.ok) throw new Error(`Upload failed (HTTP ${res.status}).`);

      const data = await res.json().catch(() => ({}));
      const nextAssets = Array.isArray(data?.branding_assets) ? data.branding_assets : [];
      setBrandingAssets(nextAssets);

      const nextSpecs: Record<string, unknown> = {
        ...specsObj,
        __branding_assets: nextAssets,
      };
      setSpecsObj(nextSpecs);
      if (!isLocked) refreshMarkdown(nextSpecs, nextAssets);
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
    }
  };

  const onFileInputChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!canEdit) return;
    await uploadBrandingAssets(files);
  };

  const markdownPreview = useMemo(() => markdownText || "", [markdownText]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background text-white flex items-center justify-center">
        <p>Loading…</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="min-h-screen bg-background text-white flex items-center justify-center p-6">
        <p className="text-sm text-red-300">{loadError}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-white px-4 py-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h1 className="text-2xl font-semibold mb-1">Locked Project Specification – Source of Truth for Code Generation</h1>
            <p className="text-sm text-muted">
              {isLocked ? "Locked. Grok will always base responses on this spec." : "Draft. Refresh from brainstorming, edit, then lock when ready."}
            </p>
          </div>
          {isLocked ? (
            <div className="px-3 py-1 rounded-full bg-primary/15 border border-primary/30 text-primary text-sm">
              Locked
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2 mb-4">
          <button
            type="button"
            onClick={onRefresh}
            disabled={!canEdit || saving || uploading}
            className="px-4 py-2 rounded-md bg-sidebar-bg border border-border hover:bg-editor-bg text-white text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Refresh from Latest Brainstorm
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={!canEdit || saving || uploading}
            className="px-4 py-2 rounded-md bg-sidebar-bg border border-border hover:bg-editor-bg text-white text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {uploading ? "Uploading…" : "Upload Branding Assets"}
          </button>
          <button
            type="button"
            onClick={onLock}
            disabled={!canEdit || saving}
            className="px-4 py-2 rounded-md bg-primary hover:bg-primary/90 text-white text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? "Locking…" : "Lock Current Summary"}
          </button>
          <button
            type="button"
            onClick={onExport}
            disabled={!markdownPreview.trim()}
            className="px-4 py-2 rounded-md bg-sidebar-bg border border-border hover:bg-editor-bg text-white text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Export .md
          </button>

          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={onFileInputChange}
            style={{ display: "none" }}
            accept="*/*"
          />
        </div>

        {uploadError ? <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 text-red-200 text-sm rounded">{uploadError}</div> : null}

        <div className="grid md:grid-cols-1 gap-4">
          <div className="bg-sidebar-bg border border-border rounded-xl p-4 md:p-6">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeHighlight]}
              components={{
                h1: (props) => <h1 className="text-xl font-semibold mt-0 mb-3" {...props} />,
                h2: (props) => <h2 className="text-lg font-semibold mt-6 mb-3" {...props} />,
                h3: (props) => <h3 className="text-md font-semibold mt-5 mb-2" {...props} />,
                p: (props) => <p className="text-sm leading-relaxed text-white/90 mb-3" {...props} />,
                ul: (props) => <ul className="list-disc pl-5 mb-3" {...props} />,
                code: ({ className, children, ...props }) => (
                  <code
                    className={`${
                      className ? className + " " : ""
                    }px-1 py-0.5 rounded bg-editor-bg border border-border text-sm hljs`}
                    {...props}
                  >
                    {children}
                  </code>
                ),
              }}
            >
              {markdownPreview}
            </ReactMarkdown>
          </div>

          {canEdit ? (
            <div className="bg-sidebar-bg border border-border rounded-xl p-4 md:p-6">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-sm font-semibold text-white/90">Edit Locked Summary (Markdown)</h2>
                <p className="text-xs text-muted">Changes are saved when you click “Lock Current Summary”.</p>
              </div>
              <textarea
                value={markdownText}
                onChange={(e) => setMarkdownText(e.target.value)}
                className="w-full min-h-[220px] bg-editor-bg border border-border rounded-lg text-sm text-white p-3 outline-none focus:border-primary"
              />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

