/**
 * A member's GitHub profile README (the `<login>/<login>` repository), read as
 * the description on their profile.
 *
 * Only its words are kept: headings, paragraphs, lists, links, emphasis and
 * code. Images, badges, stat cards, tables, code blocks and raw HTML are
 * dropped — most of a profile README is decoration that would drown the page,
 * and nothing here is ever handed to the browser as HTML. The blocks are plain
 * data that React renders as text, so a README cannot inject anything.
 *
 * No imports, so tests can call it directly.
 */

export type ReadmeInline =
  | { kind: "text"; text: string }
  | { kind: "strong" | "em" | "code"; text: string }
  | { kind: "link"; text: string; href: string };

export type ReadmeBlock =
  | { kind: "heading"; inlines: ReadmeInline[] }
  | { kind: "paragraph"; inlines: ReadmeInline[] }
  | { kind: "list"; items: ReadmeInline[][] };

/** Enough to say who somebody is; the rest is a click away on GitHub. */
const MAX_BLOCKS = 10;
const MAX_CHARACTERS = 1200;

export function parseReadme(markdown: string): ReadmeBlock[] {
  const lines = clean(markdown).split("\n");
  const blocks: ReadmeBlock[] = [];
  let paragraph: string[] = [];
  let list: string[] = [];

  const flush = () => {
    if (paragraph.length > 0) push({ kind: "paragraph", inlines: inline(paragraph.join(" ")) });
    if (list.length > 0) push({ kind: "list", items: list.map(inline) });
    paragraph = [];
    list = [];
  };
  const push = (block: ReadmeBlock) => {
    const empty = block.kind === "list" ? block.items.every((item) => item.length === 0) : block.inlines.length === 0;
    if (!empty) blocks.push(block);
  };

  for (const raw of lines) {
    const line = raw.replace(/^\s*>\s?/, "").trim();
    if (!line || /^([-*_]\s*){3,}$/.test(line)) {
      flush();
      continue;
    }
    const heading = /^#{1,6}\s+(.*?)\s*#*$/.exec(line);
    if (heading) {
      flush();
      push({ kind: "heading", inlines: inline(heading[1]) });
      continue;
    }
    const item = /^(?:[-*+]|\d+[.)])\s+(.*)$/.exec(line);
    if (item) {
      if (paragraph.length > 0) flush();
      list.push(item[1]);
      continue;
    }
    if (list.length > 0) flush();
    paragraph.push(line);
  }
  flush();

  return trim(blocks);
}

/** Drops what is not words, so the line-by-line pass only sees text. */
function clean(markdown: string): string {
  return (
    markdown
      .replace(/\r\n?/g, "\n")
      .replace(/<!--[\s\S]*?-->/g, "")
      // Fenced code blocks: stat scripts and ASCII art, not a description.
      .replace(/^\s*(```|~~~)[\s\S]*?^\s*\1[^\n]*$/gm, "")
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
      // An HTML link with words in it becomes a Markdown one; one wrapping
      // only an image goes with the image.
      .replace(/<a\s[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_, href: string, inner: string) => {
        const words = inner.replace(/<[^>]*>/g, "").trim();
        return words ? `[${words}](${href})` : "";
      })
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, "\n")
      .replace(/<[^>]*>/g, "")
      // Images, and links that only wrap one.
      .replace(/\[!\[[^\]]*\]\([^)]*\)\]\([^)]*\)/g, "")
      .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
      .replace(/!\[[^\]]*\]\[[^\]]*\]/g, "")
      // Reference definitions and table rows.
      .replace(/^\s*\[[^\]]+\]:\s*\S+.*$/gm, "")
      .replace(/^\s*\|.*$/gm, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&amp;/g, "&")
  );
}

const TOKEN = /`([^`]+)`|\*\*([^*]+)\*\*|__([^_]+)__|\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)|\*([^*\s][^*]*)\*|(?<![\w])_([^_\s][^_]*)_(?![\w])/g;

function inline(source: string): ReadmeInline[] {
  const text = source.replace(/\s+/g, " ").trim();
  const out: ReadmeInline[] = [];
  let at = 0;
  for (const match of text.matchAll(TOKEN)) {
    if (match.index > at) out.push({ kind: "text", text: text.slice(at, match.index) });
    const [, code, bold, bold2, label, href, em, em2] = match;
    if (code) out.push({ kind: "code", text: code });
    else if (label) out.push(/^https?:\/\//i.test(href) ? { kind: "link", text: strip(label), href } : { kind: "text", text: strip(label) });
    else out.push(...emphasis(bold || bold2 ? "strong" : "em", bold || bold2 || em || em2));
    at = match.index + match[0].length;
  }
  if (at < text.length) out.push({ kind: "text", text: text.slice(at) });
  return out.filter((part) => part.text.trim() !== "" || (part.kind === "text" && part.text !== ""));
}

/**
 * Emphasis around plain words keeps it; around a link — `**[Tool](url)**`,
 * common in lists of projects — the link matters more, so its parts are kept
 * as they are.
 */
function emphasis(kind: "strong" | "em", inner: string): ReadmeInline[] {
  const parts = inline(inner);
  return parts.every((part) => part.kind === "text") ? [{ kind, text: strip(inner) }] : parts;
}

/** Markers left inside a link or emphasis. */
function strip(text: string): string {
  return text.replace(/[*_`]/g, "");
}

function length(inlines: ReadmeInline[]): number {
  return inlines.reduce((sum, part) => sum + part.text.length, 0);
}

/**
 * The first blocks, up to the limits. A heading with nothing under it goes:
 * what was under it was images.
 */
function trim(blocks: ReadmeBlock[]): ReadmeBlock[] {
  const kept: ReadmeBlock[] = [];
  let characters = 0;
  const said = blocks.filter((block, index) => block.kind !== "heading" || (blocks[index + 1] && blocks[index + 1].kind !== "heading"));
  for (const block of said) {
    if (kept.length >= MAX_BLOCKS || characters >= MAX_CHARACTERS) break;
    characters += block.kind === "list" ? block.items.reduce((sum, item) => sum + length(item), 0) : length(block.inlines);
    kept.push(block);
  }
  while (kept.length > 0 && kept[kept.length - 1].kind === "heading") kept.pop();
  return kept;
}
