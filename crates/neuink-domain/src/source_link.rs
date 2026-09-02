//! 引用链接模块：定义"锚点 → 若干来源片段"的引用关系。
//!
//! `SourceLink` 与 `SegmentRef` 让笔记可以精确引用 PDF 源片段，并通过
//! 文本快照/引用哈希保证目标片段被改动后依然可定位与校验。

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::{EntryId, NoteId, SegmentType, SegmentUid, SourceLinkId};

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct SourceLink {
    pub link_id: SourceLinkId,
    pub anchor_id: String,
    pub owner: LinkOwner,
    pub sources: Vec<SegmentRef>,
    pub display_text: String,
    pub created_at: DateTime<Utc>,
}

impl SourceLink {
    pub fn note(
        entry_id: EntryId,
        note_id: NoteId,
        anchor_id: String,
        source: SegmentRef,
        display_text: String,
    ) -> Self {
        Self {
            link_id: SourceLinkId::new(),
            anchor_id,
            owner: LinkOwner::Note { entry_id, note_id },
            sources: vec![source],
            display_text,
            created_at: Utc::now(),
        }
    }
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum LinkOwner {
    Note { entry_id: EntryId, note_id: NoteId },
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct SegmentRef {
    pub entry_id: EntryId,
    pub segment_uid: SegmentUid,
    pub page: u32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub bbox: Option<[f32; 4]>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub segment_type: Option<SegmentType>,
    pub snapshot_text: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub snapshot_asset_path: Option<String>,
    pub quote_hash: String,
}
