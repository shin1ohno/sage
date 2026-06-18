//! Google People directory search — port of `src/integrations/google-people-service.ts`
//! over `reqwest`. `searchDirectoryPeople` only.

use serde::{Deserialize, Serialize};
use serde_json::Value;

const PEOPLE_SEARCH_URL: &str = "https://people.googleapis.com/v1/people:searchDirectoryPeople";
const READ_MASK: &str = "names,emailAddresses,organizations,photos";
const SOURCE: &str = "DIRECTORY_SOURCE_TYPE_DOMAIN_PROFILE";

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DirectoryPerson {
    pub resource_name: String,
    pub display_name: String,
    pub email_address: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub organization: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub photo_url: Option<String>,
}

#[derive(Debug, thiserror::Error)]
pub enum PeopleError {
    #[error("http error: {0}")]
    Http(String),
    #[error("api error {status}: {body}")]
    Api { status: u16, body: String },
}

/// Map a People API `person` object to `DirectoryPerson`. Pure.
pub fn parse_directory_person(person: &Value) -> DirectoryPerson {
    let first = |key: &str, sub: &str| -> Option<String> {
        person
            .get(key)
            .and_then(Value::as_array)
            .and_then(|a| a.first())
            .and_then(|v| v.get(sub))
            .and_then(Value::as_str)
            .map(str::to_string)
    };
    let email = first("emailAddresses", "value").unwrap_or_default();
    let display_name = first("names", "displayName")
        .or_else(|| {
            if email.is_empty() {
                None
            } else {
                Some(email.clone())
            }
        })
        .unwrap_or_else(|| "Unknown".to_string());
    // organizations[0].department ?? organizations[0].name
    let organization =
        first("organizations", "department").or_else(|| first("organizations", "name"));
    DirectoryPerson {
        resource_name: person
            .get("resourceName")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string(),
        display_name,
        email_address: email,
        organization,
        photo_url: first("photos", "url"),
    }
}

pub struct GooglePeopleClient {
    http: reqwest::Client,
    base_url: String,
}

impl Default for GooglePeopleClient {
    fn default() -> Self {
        Self::new()
    }
}

impl GooglePeopleClient {
    pub fn new() -> Self {
        Self {
            http: reqwest::Client::new(),
            base_url: PEOPLE_SEARCH_URL.to_string(),
        }
    }

    pub fn with_base_url(base_url: String) -> Self {
        Self {
            http: reqwest::Client::new(),
            base_url,
        }
    }

    /// `people.searchDirectoryPeople`. `page_size` is clamped to [1, 50].
    pub async fn search_directory_people(
        &self,
        token: &str,
        query: &str,
        page_size: u32,
    ) -> Result<Vec<DirectoryPerson>, PeopleError> {
        let page_size = page_size.clamp(1, 50).to_string();
        let resp = self
            .http
            .get(&self.base_url)
            .bearer_auth(token)
            .query(&[
                ("query", query),
                ("readMask", READ_MASK),
                ("sources", SOURCE),
                ("pageSize", page_size.as_str()),
            ])
            .send()
            .await
            .map_err(|e| PeopleError::Http(e.to_string()))?;
        let status = resp.status();
        let body = resp
            .text()
            .await
            .map_err(|e| PeopleError::Http(e.to_string()))?;
        if !status.is_success() {
            return Err(PeopleError::Api {
                status: status.as_u16(),
                body,
            });
        }
        let json: Value =
            serde_json::from_str(&body).map_err(|e| PeopleError::Http(e.to_string()))?;
        Ok(json
            .get("people")
            .and_then(Value::as_array)
            .map(|arr| arr.iter().map(parse_directory_person).collect())
            .unwrap_or_default())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn person_mapping_prefers_department_then_name() {
        let p = json!({
            "resourceName": "people/c123",
            "names": [{"displayName": "Tanaka Taro"}],
            "emailAddresses": [{"value": "tanaka@mercari.com"}],
            "organizations": [{"name": "Mercari", "department": "Platform"}],
            "photos": [{"url": "https://photo"}]
        });
        let dp = parse_directory_person(&p);
        assert_eq!(dp.resource_name, "people/c123");
        assert_eq!(dp.display_name, "Tanaka Taro");
        assert_eq!(dp.email_address, "tanaka@mercari.com");
        assert_eq!(dp.organization.as_deref(), Some("Platform")); // department wins
        assert_eq!(dp.photo_url.as_deref(), Some("https://photo"));
    }

    #[test]
    fn person_mapping_fallbacks() {
        // No name → falls back to email; no department → org name.
        let p = json!({
            "resourceName": "people/c9",
            "emailAddresses": [{"value": "x@y.com"}],
            "organizations": [{"name": "Acme"}]
        });
        let dp = parse_directory_person(&p);
        assert_eq!(dp.display_name, "x@y.com");
        assert_eq!(dp.organization.as_deref(), Some("Acme"));

        // Nothing → "Unknown" + empty email.
        let empty = parse_directory_person(&json!({"resourceName": "people/c0"}));
        assert_eq!(empty.display_name, "Unknown");
        assert_eq!(empty.email_address, "");
    }
}
