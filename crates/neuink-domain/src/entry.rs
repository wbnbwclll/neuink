//! 文献条目模块：定义一条"文献条目"（Entry）的结构及其内容项。
//!
//! `EntryMeta` 是整个文献库的一级对象，承载标题、标签、结构化字段、
//! PDF 资产与内部内容项，是所有阅读/标注操作的顶层归属。

use std::collections::BTreeMap;

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::{DomainError, EntryId, NoteId, PdfAsset, TagId};

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct EntryMeta {
    pub id: EntryId,
    pub title: String,
    #[serde(default)]
    pub tags: Vec<TagId>,
    pub fields: BTreeMap<String, String>,
    pub pdf: Option<PdfAsset>,
    pub contents: Vec<ContentItem>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl EntryMeta {
    pub fn new(title: impl Into<String>) -> Result<Self, DomainError> {
        let now = Utc::now();
        let entry = Self {
            id: EntryId::new(),
            title: title.into(),
            tags: Vec::new(),
            fields: BTreeMap::new(),
            pdf: None,
            contents: Vec::new(),
            created_at: now,
            updated_at: now,
        };
        entry.validate()?;
        Ok(entry)
    }

    pub fn validate(&self) -> Result<(), DomainError> {
        if self.title.trim().is_empty() {
            return Err(DomainError::EntryTitleRequired);
        }
        if self
            .fields
            .keys()
            .any(|key| key.eq_ignore_ascii_case("title"))
        {
            return Err(DomainError::FieldTitleForbidden);
        }
        Ok(())
    }
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum ContentItem {
    Note { note_id: NoteId, title: String },
}

#[cfg(test)]
mod tests {
    use super::EntryMeta;

    #[test]
    fn entry_requires_title() {
        assert!(EntryMeta::new(" ").is_err());
    }

    #[test]
    fn fields_reject_title() {
        let mut entry = EntryMeta::new("A paper").unwrap();
        entry
            .fields
            .insert("title".to_string(), "Shadow".to_string());
        assert!(entry.validate().is_err());
    }

    #[test]
    fn entry_defaults_to_no_tags() {
        let entry = EntryMeta::new("A paper").unwrap();
        assert!(entry.tags.is_empty());
    }
}
