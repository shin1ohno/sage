/**
 * Calendar Description Parser
 * Extracts Notion URLs, agenda sections, and Meet links from calendar event descriptions
 */

import { Parser } from 'htmlparser2';

const NOTION_DOMAIN_PATTERN = /notion\.(so|site)/;
const MEET_LINK_PATTERN = /meet\.google\.com/;
const URL_REGEX = /https?:\/\/[^\s<>"')\]]+/gi;
const AGENDA_KEYWORDS = /^(agenda|アジェンダ|議題)\s*[:：]?\s*/i;

function isHtml(text: string): boolean {
  return text.includes('<');
}

function extractHrefUrls(html: string): string[] {
  const urls: string[] = [];
  const parser = new Parser({
    onopentag(name, attrs) {
      if (name === 'a' && attrs['href']) {
        urls.push(attrs['href']);
      }
    },
  });
  parser.write(html);
  parser.end();
  return urls;
}

function extractTextContent(html: string): string {
  const chunks: string[] = [];
  const parser = new Parser({
    onopentag(name) {
      if (['br', 'p', 'div', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(name)) {
        chunks.push('\n');
      }
    },
    ontext(text) {
      chunks.push(text);
    },
    onclosetag(name) {
      if (['p', 'div', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(name)) {
        chunks.push('\n');
      }
    },
  });
  parser.write(html);
  parser.end();
  return chunks.join('');
}

function filterNotionUrls(urls: string[]): string[] {
  return urls.filter((url) => NOTION_DOMAIN_PATTERN.test(url));
}

function extractUrlsFromText(text: string): string[] {
  return Array.from(text.matchAll(URL_REGEX), (m) => m[0]);
}

/**
 * Extracts Notion URLs from a calendar event description (HTML or plain text)
 */
export function extractNotionUrls(description: string): string[] {
  if (!description) return [];

  let urls: string[];
  if (isHtml(description)) {
    urls = filterNotionUrls(extractHrefUrls(description));
  } else {
    urls = filterNotionUrls(extractUrlsFromText(description));
  }

  return [...new Set(urls)];
}

/**
 * Finds the agenda section after a matching keyword line
 */
function findAgendaSection(text: string): string | null {
  const lines = text.split('\n');
  let capturing = false;
  const agendaLines: string[] = [];

  for (const line of lines) {
    if (AGENDA_KEYWORDS.test(line.trim())) {
      capturing = true;
      const afterKeyword = line.trim().replace(AGENDA_KEYWORDS, '').trim();
      if (afterKeyword) {
        agendaLines.push(afterKeyword);
      }
      continue;
    }

    if (capturing) {
      // Stop at an empty line after we've captured content
      if (line.trim() === '' && agendaLines.length > 0) {
        break;
      }
      if (line.trim() !== '') {
        agendaLines.push(line.trim());
      }
    }
  }

  return agendaLines.length > 0 ? agendaLines.join('\n') : null;
}

/**
 * Extracts agenda content from a calendar event description
 */
export function extractAgenda(description: string): string | null {
  if (!description) return null;

  const text = isHtml(description) ? extractTextContent(description) : description;
  return findAgendaSection(text);
}

/**
 * Extracts a Google Meet link from a calendar event description
 */
export function extractMeetLink(description: string): string | null {
  if (!description) return null;

  if (isHtml(description)) {
    const hrefs = extractHrefUrls(description);
    const meetUrl = hrefs.find((url) => MEET_LINK_PATTERN.test(url));
    if (meetUrl) return meetUrl;
  }

  const urls = extractUrlsFromText(description);
  const meetUrl = urls.find((url) => MEET_LINK_PATTERN.test(url));
  return meetUrl ?? null;
}
