//! Capability gate — port of `src/services/reliability/capability-gate.ts`.
//!
//! Maps a tool name to an autonomy tier (0 = auto, 1 = confirm, 2 = forbidden)
//! and a gate decision. Unlisted tools default to Tier 1 (pending).

use std::collections::HashMap;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum GateDecision {
    Allow,
    Pending,
    Deny,
}

impl GateDecision {
    pub fn tier(self) -> u8 {
        match self {
            GateDecision::Allow => 0,
            GateDecision::Pending => 1,
            GateDecision::Deny => 2,
        }
    }
}

pub struct CapabilityGate {
    tools: HashMap<String, u8>,
    pending_ttl_minutes: u32,
}

impl CapabilityGate {
    /// Build from the autonomy tier map + pending TTL (from `UserConfig.autonomy`).
    pub fn new(tools: HashMap<String, u8>, pending_ttl_minutes: u32) -> Self {
        Self {
            tools,
            pending_ttl_minutes,
        }
    }

    pub fn update_config(&mut self, tools: HashMap<String, u8>, pending_ttl_minutes: u32) {
        self.tools = tools;
        self.pending_ttl_minutes = pending_ttl_minutes;
    }

    /// Tier for a tool; explicit 0/1/2 wins, else default 1.
    pub fn tier_for(&self, tool_name: &str) -> u8 {
        match self.tools.get(tool_name) {
            Some(&t) if t <= 2 => t,
            _ => 1,
        }
    }

    pub fn decide(&self, tool_name: &str) -> GateDecision {
        match self.tier_for(tool_name) {
            0 => GateDecision::Allow,
            2 => GateDecision::Deny,
            _ => GateDecision::Pending,
        }
    }

    pub fn pending_ttl_minutes(&self) -> u32 {
        self.pending_ttl_minutes
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn gate() -> CapabilityGate {
        let mut tools = HashMap::new();
        tools.insert("create_calendar_event".to_string(), 1u8);
        tools.insert("auto_tool".to_string(), 0u8);
        tools.insert("forbidden_tool".to_string(), 2u8);
        CapabilityGate::new(tools, 30)
    }

    #[test]
    fn tiers_and_decisions() {
        let g = gate();
        assert_eq!(g.decide("auto_tool"), GateDecision::Allow);
        assert_eq!(g.decide("create_calendar_event"), GateDecision::Pending);
        assert_eq!(g.decide("forbidden_tool"), GateDecision::Deny);
        // Unlisted → default Tier 1 (pending).
        assert_eq!(g.decide("unlisted_tool"), GateDecision::Pending);
        assert_eq!(g.pending_ttl_minutes(), 30);
    }
}
