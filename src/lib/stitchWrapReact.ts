/**
 * Stitch returns full HTML documents; Sandpack expects a React module.
 * Embed the document as innerHTML on a root div (scripts in the HTML string won't execute in React).
 */
export function wrapStitchHtmlAsReactAppTsx(html: string): string {
  const payload = JSON.stringify(html);
  return `import React from "react";

const STITCH_HTML = ${payload};

export default function App() {
  return (
    <div
      className="min-h-screen w-full stitch-ui"
      dangerouslySetInnerHTML={{ __html: STITCH_HTML }}
    />
  );
}
`;
}
