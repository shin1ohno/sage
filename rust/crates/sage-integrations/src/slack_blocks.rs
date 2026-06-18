//! Slack Block Kit builders — pure port of `src/utils/slack-blocks.ts`.
//!
//! Truncation note: the TS `.slice(0, n)` cuts by UTF-16 code units; this port
//! cuts by `char` (`chars().take(n)`), which matches for ASCII and is a safe
//! approximation for multibyte content.

use serde_json::{json, Value};

pub const MAX_BLOCKS: usize = 50;
const HEADER_MAX: usize = 150;
const SECTION_MAX: usize = 3000;

/// Links rendered into a Slack context block.
#[derive(Debug, Clone, Default)]
pub struct SourceLinks {
    pub notion_urls: Vec<String>,
    pub transcript_url: Option<String>,
    pub slack_channel_urls: Vec<String>,
}

/// Daily-summary counters (from the pipeline; minimal shape for the block).
#[derive(Debug, Clone, Default)]
pub struct DailySummaryStatus {
    pub briefings_sent_today: u64,
    pub post_meeting_processed_today: u64,
    pub action_items_created_today: u64,
    pub errors_today: u64,
    pub pending_post_meeting_polls: u64,
}

/// A critical pipeline error rendered to Slack.
#[derive(Debug, Clone)]
pub struct CriticalPipelineError {
    pub error_type: String,
    pub message: String,
    pub timestamp: String,
    pub details: Option<String>,
}

fn take_chars(s: &str, n: usize) -> String {
    s.chars().take(n).collect()
}

pub fn header_block(text: &str) -> Value {
    json!({
        "type": "header",
        "text": { "type": "plain_text", "text": take_chars(text, HEADER_MAX), "emoji": true }
    })
}

pub fn section_block(mrkdwn: &str) -> Value {
    json!({
        "type": "section",
        "text": { "type": "mrkdwn", "text": take_chars(mrkdwn, SECTION_MAX) }
    })
}

pub fn context_block(elements: Vec<Value>) -> Value {
    json!({ "type": "context", "elements": elements })
}

/// Build context elements: Notion links, then Slack channel links, then transcript.
pub fn build_source_elements(links: &SourceLinks) -> Vec<Value> {
    let mut elements = Vec::new();
    for url in &links.notion_urls {
        elements.push(json!({ "type": "mrkdwn", "text": format!("<{url}|Notion>") }));
    }
    for url in &links.slack_channel_urls {
        elements.push(json!({ "type": "mrkdwn", "text": format!("<{url}|Slack>") }));
    }
    if let Some(url) = &links.transcript_url {
        elements.push(json!({ "type": "mrkdwn", "text": format!("<{url}|Transcript>") }));
    }
    elements
}

/// Split content into section blocks on blank lines (2+ newlines), capped at
/// `max_sections`. Non-empty content with no blank lines yields one section.
pub fn split_content_into_sections(content: &str, max_sections: usize) -> Vec<Value> {
    if content.is_empty() {
        return Vec::new();
    }
    let mut sections = Vec::new();
    for para in split_paragraphs(content) {
        if sections.len() >= max_sections {
            break;
        }
        sections.push(section_block(&para));
    }
    if sections.is_empty() {
        sections.push(section_block(content));
    }
    sections
}

/// `content.split(/\n{2,}/).filter(p => p.trim())`.
fn split_paragraphs(content: &str) -> Vec<String> {
    let mut paras = Vec::new();
    let mut current = String::new();
    let mut newline_run = 0usize;
    for c in content.chars() {
        if c == '\n' {
            newline_run += 1;
        } else {
            if newline_run >= 2 {
                // paragraph boundary
                if !current.trim().is_empty() {
                    paras.push(current.clone());
                }
                current.clear();
            } else if newline_run == 1 {
                current.push('\n');
            }
            newline_run = 0;
            current.push(c);
        }
    }
    if !current.trim().is_empty() {
        paras.push(current);
    }
    paras
}

pub fn truncate_blocks(mut blocks: Vec<Value>) -> Vec<Value> {
    if blocks.len() > MAX_BLOCKS {
        blocks.truncate(MAX_BLOCKS);
    }
    blocks
}

fn briefing_like(title: &str, time: &str, content: &str, links: &SourceLinks) -> Vec<Value> {
    let mut blocks = vec![header_block(&format!("{title} - {time}"))];
    blocks.extend(split_content_into_sections(content, MAX_BLOCKS - 2));
    let elements = build_source_elements(links);
    if !elements.is_empty() {
        blocks.push(context_block(elements));
    }
    truncate_blocks(blocks)
}

pub fn format_briefing(title: &str, time: &str, content: &str, links: &SourceLinks) -> Vec<Value> {
    briefing_like(title, time, content, links)
}

pub fn format_post_meeting_report(
    title: &str,
    time: &str,
    content: &str,
    links: &SourceLinks,
) -> Vec<Value> {
    briefing_like(title, time, content, links)
}

pub fn format_daily_summary(status: &DailySummaryStatus) -> Vec<Value> {
    let section = [
        format!("*Briefings sent:* {}", status.briefings_sent_today),
        format!(
            "*Post-meeting processed:* {}",
            status.post_meeting_processed_today
        ),
        format!(
            "*Action items created:* {}",
            status.action_items_created_today
        ),
        format!("*Errors:* {}", status.errors_today),
        format!(
            "*Pending post-meeting polls:* {}",
            status.pending_post_meeting_polls
        ),
    ]
    .join("\n");
    vec![
        header_block("\u{1F4CA} Daily Pipeline Summary"),
        section_block(&section),
    ]
}

pub fn format_critical_error(error: &CriticalPipelineError) -> Vec<Value> {
    let mut blocks = vec![header_block("\u{26A0}\u{FE0F} Pipeline Error")];
    let section = [
        format!("*Type:* {}", error.error_type),
        format!("*Message:* {}", error.message),
        format!("*Timestamp:* {}", error.timestamp),
    ]
    .join("\n");
    blocks.push(section_block(&section));
    if let Some(details) = &error.details {
        blocks.push(section_block(&format!("*Details:*\n{details}")));
    }
    truncate_blocks(blocks)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn header_and_section_truncation() {
        let h = header_block(&"x".repeat(200));
        assert_eq!(h["text"]["text"].as_str().unwrap().chars().count(), 150);
        let s = section_block(&"y".repeat(4000));
        assert_eq!(s["text"]["text"].as_str().unwrap().chars().count(), 3000);
    }

    #[test]
    fn paragraph_split_on_two_or_more_newlines() {
        let secs = split_content_into_sections("a\n\n\nb\n\nc", 48);
        assert_eq!(secs.len(), 3);
        assert_eq!(secs[0]["text"]["text"], "a");
        assert_eq!(secs[1]["text"]["text"], "b");
        assert_eq!(secs[2]["text"]["text"], "c");
        // single-newline content stays one section
        assert_eq!(split_content_into_sections("line1\nline2", 48).len(), 1);
        // empty → none
        assert!(split_content_into_sections("", 48).is_empty());
    }

    #[test]
    fn daily_summary_exact_shape() {
        let blocks = format_daily_summary(&DailySummaryStatus {
            briefings_sent_today: 2,
            post_meeting_processed_today: 1,
            action_items_created_today: 5,
            errors_today: 0,
            pending_post_meeting_polls: 3,
        });
        assert_eq!(blocks.len(), 2);
        assert_eq!(
            blocks[0]["text"]["text"],
            "\u{1F4CA} Daily Pipeline Summary"
        );
        assert_eq!(
            blocks[1]["text"]["text"],
            "*Briefings sent:* 2\n*Post-meeting processed:* 1\n*Action items created:* 5\n*Errors:* 0\n*Pending post-meeting polls:* 3"
        );
    }

    #[test]
    fn source_elements_order_and_briefing() {
        let links = SourceLinks {
            notion_urls: vec!["https://n1".into()],
            slack_channel_urls: vec!["https://s1".into()],
            transcript_url: Some("https://t".into()),
        };
        let els = build_source_elements(&links);
        assert_eq!(els[0]["text"], "<https://n1|Notion>");
        assert_eq!(els[1]["text"], "<https://s1|Slack>");
        assert_eq!(els[2]["text"], "<https://t|Transcript>");

        let b = format_briefing("Standup", "10:00", "body", &links);
        assert_eq!(b[0]["type"], "header");
        assert_eq!(b[0]["text"]["text"], "Standup - 10:00");
        assert_eq!(b.last().unwrap()["type"], "context");
    }

    #[test]
    fn critical_error_with_and_without_details() {
        let with = format_critical_error(&CriticalPipelineError {
            error_type: "google_auth".into(),
            message: "scope not granted".into(),
            timestamp: "2026-01-01T00:00:00Z".into(),
            details: Some("stack".into()),
        });
        assert_eq!(with[0]["text"]["text"], "\u{26A0}\u{FE0F} Pipeline Error");
        assert_eq!(with.len(), 3);
        assert!(with[2]["text"]["text"]
            .as_str()
            .unwrap()
            .starts_with("*Details:*"));

        let without = format_critical_error(&CriticalPipelineError {
            error_type: "t".into(),
            message: "m".into(),
            timestamp: "ts".into(),
            details: None,
        });
        assert_eq!(without.len(), 2);
    }
}
