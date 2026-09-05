use std::collections::BTreeMap;

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::EntryId;

fn reading_state_version() -> u32 {
    1
}

#[derive(Clone, Copy, Debug, Default, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ReadingMode {
    #[default]
    Pdf,
    Reflow,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(default)]
pub struct ReadingState {
    pub version: u32,
    pub document_hash: Option<String>,
    pub mode: ReadingMode,
    pub current_page_idx: Option<u32>,
    pub page_count: u32,
    pub visited_pages: Vec<u32>,
    pub total_active_ms: u64,
    pub session_count: u32,
    pub last_read_at: Option<DateTime<Utc>>,
    pub daily_active_ms: BTreeMap<String, u64>,
}

impl Default for ReadingState {
    fn default() -> Self {
        Self {
            version: reading_state_version(),
            document_hash: None,
            mode: ReadingMode::Pdf,
            current_page_idx: None,
            page_count: 0,
            visited_pages: Vec::new(),
            total_active_ms: 0,
            session_count: 0,
            last_read_at: None,
            daily_active_ms: BTreeMap::new(),
        }
    }
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct EntryReadingState {
    pub entry_id: EntryId,
    #[serde(flatten)]
    pub state: ReadingState,
}

#[derive(Clone, Debug, Default, Deserialize, PartialEq, Serialize)]
#[serde(default)]
pub struct ReadingStateUpdate {
    pub mode: ReadingMode,
    pub current_page_idx: Option<u32>,
    pub page_count: u32,
    pub visited_pages: Vec<u32>,
    pub active_ms_delta: u64,
    pub session_start: bool,
    pub local_date: Option<String>,
}
