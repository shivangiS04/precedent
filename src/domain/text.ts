/**
 * Text normalisation for deterministic matching. Pure, no runtime imports.
 * Tokens are lowercased, split on non-alphanumerics and lightly stemmed so
 * "flags"/"flag", "encrypted"/"encrypt", "cache"/"caching" compare equal.
 */

export function stem(word: string): string {
  let w = word.toLowerCase();
  if (w.length <= 3) return w;
  if (w.endsWith('ies') && w.length > 4) w = w.slice(0, -3) + 'y';
  else if (/(ss|sh|ch|x)es$/.test(w)) w = w.slice(0, -2);
  else if (w.endsWith('s') && !w.endsWith('ss') && !w.endsWith('us')) w = w.slice(0, -1);
  if (w.endsWith('ing') && w.length > 5) w = w.slice(0, -3);
  else if (w.endsWith('ed') && w.length > 4) w = w.slice(0, -2);
  if (w.endsWith('e') && w.length > 3) w = w.slice(0, -1);
  return w;
}

export function tokenize(text: string | null | undefined): string[] {
  if (!text) return [];
  return String(text)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map(stem);
}

/** True if `phrase` occurs as a contiguous run of tokens in `tokens`. */
export function containsPhrase(tokens: string[], phrase: string[]): boolean {
  if (phrase.length === 0 || phrase.length > tokens.length) return false;
  outer: for (let i = 0; i <= tokens.length - phrase.length; i++) {
    for (let j = 0; j < phrase.length; j++) if (tokens[i + j] !== phrase[j]) continue outer;
    return true;
  }
  return false;
}

/** Flattens Atlassian Document Format (Jira descriptions/comments) into plain text. */
export function adfToText(node: unknown): string {
  if (node == null) return '';
  if (typeof node === 'string') return node;
  const n = node as { type?: string; text?: string; content?: unknown[]; attrs?: { text?: string } };
  if (n.type === 'text') return n.text ?? '';
  if (n.type === 'mention' || n.type === 'emoji') return n.attrs?.text ?? '';
  if (n.type === 'hardBreak') return '\n';
  const inner = (n.content ?? []).map(adfToText).join(n.type === 'doc' || n.type === 'bulletList' || n.type === 'orderedList' ? '\n' : '');
  return ['paragraph', 'heading', 'listItem', 'codeBlock', 'blockquote', 'tableRow'].includes(n.type ?? '') ? `${inner}\n` : inner;
}
