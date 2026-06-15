//! Configuration sub-structures consumed by the pure domain engines.
//!
//! These live in `sage-domain` (the no-dependency base crate) so the engines
//! depend only on this crate. `sage-config` composes them into the full
//! `UserConfig` and owns the I/O-layer config (integrations, autonomy, remote).
//!
//! All structs serialize with camelCase keys to match the TypeScript
//! `~/.sage/config.json` shape exactly (round-trip fidelity).

use crate::Priority;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Time-estimation tuning. Mirrors TS `EstimationConfig` (`src/types/config.ts`).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EstimationConfig {
    pub simple_task_minutes: u32,
    pub medium_task_minutes: u32,
    pub complex_task_minutes: u32,
    pub project_task_minutes: u32,
    pub keyword_mapping: KeywordMapping,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub user_adjustments: Option<HashMap<String, f64>>,
}

/// Complexity-tier keyword groups. Mirrors TS `KeywordMapping`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct KeywordMapping {
    pub simple: Vec<String>,
    pub medium: Vec<String>,
    pub complex: Vec<String>,
    pub project: Vec<String>,
}

/// Priority rule sets evaluated as a first-match cascade. Mirrors TS
/// `PriorityRules`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PriorityRules {
    pub p0_conditions: Vec<PriorityCondition>,
    pub p1_conditions: Vec<PriorityCondition>,
    pub p2_conditions: Vec<PriorityCondition>,
    pub default_priority: Priority,
}

/// A single priority condition. Mirrors TS `PriorityCondition`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PriorityCondition {
    #[serde(rename = "type")]
    pub condition_type: ConditionType,
    pub operator: ConditionOperator,
    pub value: ConditionValue,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub unit: Option<DeadlineUnit>,
    pub description: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub weight: Option<f64>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ConditionType {
    Deadline,
    Keyword,
    Stakeholder,
    Blocking,
    Custom,
}

/// Mirrors the TS operator union `'<' | '>' | '=' | 'contains' | 'matches'`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ConditionOperator {
    #[serde(rename = "<")]
    Lt,
    #[serde(rename = ">")]
    Gt,
    #[serde(rename = "=")]
    Eq,
    #[serde(rename = "contains")]
    Contains,
    #[serde(rename = "matches")]
    Matches,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DeadlineUnit {
    Hours,
    Days,
    Weeks,
}

/// The TS `value: string | number | string[]` union. Untagged: a JSON number
/// deserializes to `Number`, an array to `List`, a string to `Text`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum ConditionValue {
    Number(f64),
    List(Vec<String>),
    Text(String),
}

/// Team configuration used by priority + stakeholder engines. Mirrors TS
/// `TeamConfig`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TeamConfig {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub manager: Option<TeamMember>,
    pub frequent_collaborators: Vec<TeamMember>,
    pub departments: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TeamMember {
    pub name: String,
    pub role: TeamRole,
    pub keywords: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub priority: Option<f64>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TeamRole {
    Manager,
    Lead,
    Team,
    Collaborator,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn condition_operator_serializes_to_symbols() {
        assert_eq!(
            serde_json::to_string(&ConditionOperator::Lt).unwrap(),
            "\"<\""
        );
        assert_eq!(
            serde_json::to_string(&ConditionOperator::Contains).unwrap(),
            "\"contains\""
        );
    }

    #[test]
    fn condition_value_untagged_roundtrip() {
        // number
        let n: ConditionValue = serde_json::from_str("24").unwrap();
        assert_eq!(n, ConditionValue::Number(24.0));
        // array
        let l: ConditionValue = serde_json::from_str(r#"["urgent","緊急"]"#).unwrap();
        assert_eq!(
            l,
            ConditionValue::List(vec!["urgent".into(), "緊急".into()])
        );
        // string
        let s: ConditionValue = serde_json::from_str(r#""manager""#).unwrap();
        assert_eq!(s, ConditionValue::Text("manager".into()));
    }

    #[test]
    fn priority_condition_camel_case_keys() {
        let c = PriorityCondition {
            condition_type: ConditionType::Deadline,
            operator: ConditionOperator::Lt,
            value: ConditionValue::Number(24.0),
            unit: Some(DeadlineUnit::Hours),
            description: "Due within 24 hours".into(),
            weight: None,
        };
        let json = serde_json::to_value(&c).unwrap();
        assert_eq!(json["type"], "deadline");
        assert_eq!(json["operator"], "<");
        assert_eq!(json["unit"], "hours");
        // optional `weight` omitted when None
        assert!(json.get("weight").is_none());
    }
}
