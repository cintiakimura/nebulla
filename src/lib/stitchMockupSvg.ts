/**
 * Extract and sanitize inline SVG from Stitch HTML output for safe DOM preview.
 */

export function sanitizeSvgForInline(svg: string): string {
  let s = svg.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "");
  s = s.replace(/\s+on\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  return s;
}

export function extractSvgFromStitchHtml(html: string): string | null {
  if (!html || typeof html !== "string") return null;
  const stripped = html.replace(/<!--[\s\S]*?-->/g, "");
  const bodyMatch = stripped.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  const region = bodyMatch ? bodyMatch[1] : stripped;
  const svgMatch = region.match(/<svg\b[\s\S]*?<\/svg>/i);
  if (!svgMatch) return null;
  return sanitizeSvgForInline(svgMatch[0].trim());
}
