/**
 * Calendar Description Parser
 * Pure functions to extract structured data from calendar event descriptions.
 * Uses regex-based HTML parsing to avoid ESM-only dependency issues.
 */

const NOTION_DOMAIN_PATTERN = /\bnotion\.(so|site)\b/;
const URL_REGEX = /https?:\/\/[^\s<>"')\]]+/g;
const MEET_LINK_PATTERN = /https?:\/\/meet\.google\.com\/[^\s<>"')\]]+/;
const AGENDA_KEYWORDS = /(?:^|\n)\s*(?:agenda|アジェンダ|議題)\s*[:\uff1a]?\s*/i;

const HREF_REGEX = /<a\s[^>]*href\s*=\s*["']([^"']+)["'][^>]*>/gi;
const HTML_TAG_REGEX = /<[^>]+>/g;
const BLOCK_TAG_REGEX = /<\/?\s*(?:br|p|div|li|h[1-6]|tr)\b[^>]*\/?>/gi;

function isHtml(text: string): boolean {
  return text.includes('<');
}

function extractHrefUrls(html: string): string[] {
  const urls: string[] = [];
  let match: RegExpExecArray | null;
  const regex = new RegExp(HREF_REGEX.source, HREF_REGEX.flags);
  while ((match = regex.exec(html)) !== null) {
    urls.push(match[1]);
  }
  return urls;
}

function stripHtmlToText(html: string): string {
  // Replace block-level tags with newlines
  let text = html.replace(BLOCK_TAG_REGEX, '\n');
  // Remove all remaining tags
  text = text.replace(HTML_TAG_REGEX, '');
  // Decode common HTML entities
  text = text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
  // Collapse multiple newlines
  text = text.replace(/\n{3,}/g, '\n\n');
  return text.trim();
}

/**
 * Extract Notion URLs from a calendar event description (HTML or plain text).
 * Returns deduplicated array of notion.so/notion.site URLs.
 */
export function extractNotionUrls(description: string): string[] {
  if (!description) {
    return [];
  }

  let urls: string[];
  if (isHtml(description)) {
    urls = extractHrefUrls(description);
  } else {
    const matches = description.match(URL_REGEX);
    urls = matches ?? [];
  }

  const notionUrls = urls.filter((url) => NOTION_DOMAIN_PATTERN.test(url));
  return [...new Set(notionUrls)];
}

/**
 * Extract agenda section from a calendar event description.
 * Looks for "Agenda", "アジェンダ", or "議題" headings.
 * Returns plain text content after the heading, or null if not found.
 */
export function extractAgenda(description: string): string | null {
  if (!description) {
    return null;
  }

  const text = isHtml(description) ? stripHtmlToText(description) : description;
  const match = AGENDA_KEYWORDS.exec(text);
  if (!match) {
    return null;
  }

  const afterKeyword = text.slice(match.index + match[0].length).trim();
  return afterKeyword || null;
}

/**
 * Extract Google Meet link from a calendar event description.
 * Returns the first meet.google.com URL found, or null.
 */
export function extractMeetLink(description: string): string | null {
  if (!description) {
    return null;
  }

  if (isHtml(description)) {
    const urls = extractHrefUrls(description);
    const meetUrl = urls.find((url) => MEET_LINK_PATTERN.test(url));
    return meetUrl ?? null;
  }

  const match = description.match(MEET_LINK_PATTERN);
  return match ? match[0] : null;
}
