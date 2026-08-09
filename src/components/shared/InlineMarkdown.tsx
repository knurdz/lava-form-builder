import type { ReactNode } from "react";

type Token =
  | { type: "text"; value: string }
  | { type: "bold"; value: string }
  | { type: "italic"; value: string }
  | { type: "underline"; value: string }
  | { type: "link"; label: string; href: string };

const LINK_PATTERN = /^\[([^\]]+)\]\(([^)]+)\)/;
const BOLD_PATTERN = /^\*\*(.+?)\*\*/;
const ITALIC_PATTERN = /^\*(.+?)\*/;
const UNDERLINE_PATTERN = /^__(.+?)__/;

function isSafeHref(href: string): boolean {
  const trimmed = href.trim();
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) return true;
  try {
    const url = new URL(trimmed);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function normalizeHref(href: string): string {
  const trimmed = href.trim();
  if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith("/")) return trimmed;
  return `https://${trimmed}`;
}

function tokenizeInline(text: string): Token[] {
  const tokens: Token[] = [];
  let cursor = 0;

  while (cursor < text.length) {
    const rest = text.slice(cursor);
    const linkMatch = LINK_PATTERN.exec(rest);
    if (linkMatch) {
      const href = normalizeHref(linkMatch[2]);
      if (isSafeHref(href)) {
        tokens.push({ type: "link", label: linkMatch[1], href });
      } else {
        tokens.push({ type: "text", value: linkMatch[0] });
      }
      cursor += linkMatch[0].length;
      continue;
    }

    const boldMatch = BOLD_PATTERN.exec(rest);
    if (boldMatch) {
      tokens.push({ type: "bold", value: boldMatch[1] });
      cursor += boldMatch[0].length;
      continue;
    }

    const underlineMatch = UNDERLINE_PATTERN.exec(rest);
    if (underlineMatch) {
      tokens.push({ type: "underline", value: underlineMatch[1] });
      cursor += underlineMatch[0].length;
      continue;
    }

    const italicMatch = ITALIC_PATTERN.exec(rest);
    if (italicMatch) {
      tokens.push({ type: "italic", value: italicMatch[1] });
      cursor += italicMatch[0].length;
      continue;
    }

    const nextSpecial = rest.search(/\[|\*\*|__|\*/);
    const plainLength = nextSpecial === -1 ? rest.length : nextSpecial;
    tokens.push({ type: "text", value: rest.slice(0, plainLength) });
    cursor += plainLength;
  }

  return tokens;
}

function renderTokens(tokens: Token[], keyPrefix: string): ReactNode[] {
  return tokens.map((token, index) => {
    const key = `${keyPrefix}-${index}`;

    if (token.type === "text") return token.value;
    if (token.type === "bold") {
      return (
        <strong key={key} className="font-semibold text-zinc-100">
          {renderInlineMarkdown(token.value, `${key}-nested`)}
        </strong>
      );
    }
    if (token.type === "italic") {
      return (
        <em key={key} className="italic">
          {renderInlineMarkdown(token.value, `${key}-nested`)}
        </em>
      );
    }
    if (token.type === "underline") {
      return (
        <span key={key} className="underline underline-offset-2">
          {renderInlineMarkdown(token.value, `${key}-nested`)}
        </span>
      );
    }

    const isExternal = /^https?:\/\//i.test(token.href);
    return (
      <a
        key={key}
        href={token.href}
        target={isExternal ? "_blank" : undefined}
        rel={isExternal ? "noopener noreferrer" : undefined}
        onClick={(event) => event.stopPropagation()}
        className="text-emerald-400 underline decoration-emerald-400/30 underline-offset-4 transition-colors hover:text-emerald-300"
      >
        {renderInlineMarkdown(token.label, `${key}-label`)}
      </a>
    );
  });
}

export function renderInlineMarkdown(text: string, keyPrefix = "md"): ReactNode {
  if (!text) return null;
  return renderTokens(tokenizeInline(text), keyPrefix);
}

export function InlineMarkdown({ children }: { children: string }) {
  return <>{renderInlineMarkdown(children)}</>;
}

export function stripInlineMarkdown(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/\*(.+?)\*/g, "$1");
}
