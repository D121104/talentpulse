/** Remove executable markup and all non-local resource references before Chromium sees user HTML. */
export function sanitizePdfHtml(input: string): string {
  const bounded = input.slice(0, MAX_PDF_HTML_LENGTH);
  const withoutDangerousBlocks = bounded
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(
      /<\s*(?:script|iframe|object|embed|base|form|video|audio|source|link|frame|frameset)\b[^>]*>[\s\S]*?(?:<\s*\/\s*(?:script|iframe|object|embed|base|form|video|audio|source|link|frame|frameset)\s*>|$)/gi,
      '',
    )
    .replace(
      /<\s*(?:script|iframe|object|embed|base|form|video|audio|source|link|frame|frameset)\b[^>]*\/?\s*>/gi,
      '',
    );

  const withoutRemoteCss = withoutDangerousBlocks.replace(
    /<\s*style\b[^>]*>([\s\S]*?)<\s*\/\s*style\s*>/gi,
    (_full, css) => `<style>${sanitizeCss(String(css))}</style>`,
  );

  return withoutRemoteCss.replace(
    /<\s*(\/?)([a-z0-9:-]+)([^>]*)>/gi,
    (full, closing, rawTag, attributes) => {
      const tag = String(rawTag).toLowerCase();
      if (!ALLOWED_PDF_TAGS.has(tag)) return '';
      if (closing) return `</${tag}>`;
      if (tag === 'style') return `<style${sanitizePdfAttributes(attributes)}>`;
      const suffix =
        VOID_PDF_TAGS.has(tag) || /\/\s*$/.test(attributes) ? ' /' : '';
      return `<${tag}${sanitizePdfAttributes(attributes)}${suffix}>`;
    },
  );
}

export function isTrustedPdfResource(url: string): boolean {
  return /^(?:about:blank|data:image\/(?:png|jpeg|gif|webp);|blob:)/i.test(url);
}

const MAX_PDF_HTML_LENGTH = 500_000;
const ALLOWED_PDF_TAGS = new Set([
  'html',
  'head',
  'body',
  'meta',
  'title',
  'style',
  'div',
  'span',
  'p',
  'br',
  'strong',
  'b',
  'em',
  'i',
  'u',
  'small',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'ul',
  'ol',
  'li',
  'section',
  'article',
  'header',
  'footer',
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
  'img',
  'a',
]);
const VOID_PDF_TAGS = new Set([
  'area',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'meta',
  'source',
  'track',
  'wbr',
]);

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return entities[character];
  });
}

function sanitizeCss(css: string): string {
  return css
    .replace(/@import[^;]+;?/gi, '')
    .replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, (_match, quote, url) =>
      /^(?:data:image\/(?:png|jpeg|gif|webp);|blob:)/i.test(String(url).trim())
        ? `url(${quote}${url}${quote})`
        : 'none',
    )
    .replace(/(?:expression|behavior|-moz-binding)\s*:/gi, 'blocked:');
}

function sanitizePdfAttributes(attributes: string): string {
  const safeAttributes: string[] = [];
  const attributePattern =
    /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let match: RegExpExecArray | null;
  while ((match = attributePattern.exec(attributes))) {
    const name = match[1].toLowerCase();
    const value = match[2] ?? match[3] ?? match[4] ?? '';
    if (
      name.startsWith('on') ||
      name === 'srcdoc' ||
      name === 'formaction' ||
      (name === 'style' &&
        /(?:url\s*\(|expression|behavior|-moz-binding)/i.test(value))
    )
      continue;
    if (name === 'style') {
      safeAttributes.push(`style="${escapeHtml(sanitizeCss(value))}"`);
      continue;
    }
    if (
      !['class', 'id', 'title', 'alt', 'width', 'height', 'role'].includes(
        name,
      ) &&
      !name.startsWith('aria-') &&
      !name.startsWith('data-') &&
      name !== 'href' &&
      name !== 'src'
    )
      continue;
    if (name === 'href' && !/^(?:#|mailto:)/i.test(value.trim())) continue;
    if (
      name === 'src' &&
      !/^(?:data:image\/(?:png|jpeg|gif|webp);|blob:)/i.test(value.trim())
    )
      continue;
    safeAttributes.push(`${name}="${escapeHtml(value)}"`);
  }
  return safeAttributes.length ? ` ${safeAttributes.join(' ')}` : '';
}
