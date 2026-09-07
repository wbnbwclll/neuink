//! 标注模块：定义对单个源片段的结构化标注（评论、高亮等）。
//!
//! `Annotation` 携带类别、内容、重要度并快照所依赖的片段信息，使原片段
//! 变更或删除后标注仍能展示；配合文本选区类型实现页面高亮。

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::{AnnotationId, DomainError, SegmentType, SegmentUid, SourceSegment};

pub const PDF_PAGE_ANNOTATION_SEGMENT_PREFIX: &str = "pdf-page:";

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct Annotation {
    pub annotation_id: AnnotationId,
    pub segment_uid: SegmentUid,
    #[serde(default, skip_serializing_if = "AnnotationAnchorKind::is_segment")]
    pub anchor_kind: AnnotationAnchorKind,
    pub kind: String,
    pub content: String,
    pub importance: AnnotationImportance,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub segment_snapshot: Option<AnnotationSegmentSnapshot>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub text_selection: Option<AnnotationTextSelection>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct AnnotationSegmentSnapshot {
    pub asset_path: Option<String>,
    pub bbox: Option<[f32; 4]>,
    pub markdown: Option<String>,
    pub page_idx: u32,
    pub segment_type: SegmentType,
    pub segment_uid: SegmentUid,
    pub text: String,
}

impl Annotation {
    pub fn new(
        segment_uid: SegmentUid,
        kind: impl Into<String>,
        content: impl Into<String>,
        importance: AnnotationImportance,
    ) -> Self {
        let now = Utc::now();
        Self {
            annotation_id: AnnotationId::new(),
            segment_uid,
            anchor_kind: AnnotationAnchorKind::Segment,
            kind: normalize_kind(kind),
            content: content.into().trim().to_string(),
            importance,
            segment_snapshot: None,
            text_selection: None,
            created_at: now,
            updated_at: now,
        }
    }

    pub fn new_for_segment(
        segment: &SourceSegment,
        kind: impl Into<String>,
        content: impl Into<String>,
        importance: AnnotationImportance,
    ) -> Self {
        let mut annotation = Self::new(segment.uid.clone(), kind, content, importance);
        annotation.segment_snapshot = Some(AnnotationSegmentSnapshot::from(segment));
        annotation
    }

    pub fn new_for_pdf_page(
        selection: AnnotationTextSelection,
        kind: impl Into<String>,
        content: impl Into<String>,
        importance: AnnotationImportance,
    ) -> Result<Self, DomainError> {
        selection.validate()?;
        let segment_uid = pdf_page_annotation_segment_uid(selection.page_idx);
        let mut annotation = Self::new(segment_uid.clone(), kind, content, importance);
        annotation.anchor_kind = AnnotationAnchorKind::PdfPage;
        annotation.segment_snapshot = Some(AnnotationSegmentSnapshot {
            asset_path: None,
            bbox: selection.bounding_rect(),
            markdown: None,
            page_idx: selection.page_idx,
            segment_type: SegmentType::Paragraph,
            segment_uid,
            text: selection.text.trim().to_string(),
        });
        annotation.text_selection = Some(selection);
        Ok(annotation)
    }

    pub fn update(
        &mut self,
        kind: impl Into<String>,
        content: impl Into<String>,
        importance: AnnotationImportance,
    ) {
        self.kind = normalize_kind(kind);
        self.content = content.into().trim().to_string();
        self.importance = importance;
        self.updated_at = Utc::now();
    }

    pub fn refresh_segment_snapshot(&mut self, segment: &SourceSegment) {
        self.segment_snapshot = Some(AnnotationSegmentSnapshot::from(segment));
        self.updated_at = Utc::now();
    }
}

#[derive(Clone, Copy, Debug, Default, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum AnnotationAnchorKind {
    #[default]
    Segment,
    PdfPage,
}

impl AnnotationAnchorKind {
    fn is_segment(&self) -> bool {
        *self == Self::Segment
    }
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct AnnotationTextSelection {
    #[serde(default = "default_highlight_color")]
    pub color: String,
    pub page_idx: u32,
    pub rects: Vec<[f32; 4]>,
    pub text: String,
}

impl AnnotationTextSelection {
    pub fn validate(&self) -> Result<(), DomainError> {
        if self.text.trim().is_empty() {
            return Err(DomainError::PdfAnnotationSelectionTextRequired);
        }
        if self.rects.is_empty() {
            return Err(DomainError::PdfAnnotationSelectionRectsRequired);
        }
        if !matches!(self.color.as_str(), "yellow" | "green" | "blue" | "pink") {
            return Err(DomainError::PdfAnnotationHighlightColorUnsupported(
                self.color.clone(),
            ));
        }
        for (index, [x0, y0, x1, y1]) in self.rects.iter().copied().enumerate() {
            let coordinates = [x0, y0, x1, y1];
            if coordinates
                .iter()
                .any(|coordinate| !coordinate.is_finite() || !(0.0..=1000.0).contains(coordinate))
                || x1 <= x0
                || y1 <= y0
            {
                return Err(DomainError::PdfAnnotationSelectionRectInvalid { index });
            }
        }
        Ok(())
    }

    pub fn bounding_rect(&self) -> Option<[f32; 4]> {
        let first = self.rects.first().copied()?;
        Some(self.rects.iter().skip(1).fold(first, |bounds, rect| {
            [
                bounds[0].min(rect[0]),
                bounds[1].min(rect[1]),
                bounds[2].max(rect[2]),
                bounds[3].max(rect[3]),
            ]
        }))
    }
}

fn default_highlight_color() -> String {
    "yellow".to_string()
}

impl From<&SourceSegment> for AnnotationSegmentSnapshot {
    fn from(segment: &SourceSegment) -> Self {
        Self {
            asset_path: segment.asset_path.clone(),
            bbox: segment.bbox,
            markdown: segment.markdown.clone(),
            page_idx: segment.page_idx,
            segment_type: segment.segment_type,
            segment_uid: segment.uid.clone(),
            text: segment.text.clone(),
        }
    }
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum AnnotationImportance {
    Core,
    Important,
    Normal,
}

fn normalize_kind(kind: impl Into<String>) -> String {
    kind.into().trim().to_string()
}

pub fn pdf_page_annotation_segment_uid(page_idx: u32) -> SegmentUid {
    SegmentUid::from_string(format!("{PDF_PAGE_ANNOTATION_SEGMENT_PREFIX}{page_idx}"))
}

#[cfg(test)]
mod tests {
    use super::{
        pdf_page_annotation_segment_uid, Annotation, AnnotationAnchorKind, AnnotationImportance,
        AnnotationTextSelection,
    };
    use crate::DomainError;

    fn selection() -> AnnotationTextSelection {
        AnnotationTextSelection {
            color: "yellow".to_string(),
            page_idx: 2,
            rects: vec![[100.0, 200.0, 300.0, 240.0], [90.0, 250.0, 420.0, 290.0]],
            text: "Selected text".to_string(),
        }
    }

    #[test]
    fn creates_stable_pdf_page_anchor_with_snapshot_bounds() {
        let annotation = Annotation::new_for_pdf_page(
            selection(),
            "highlight",
            "",
            AnnotationImportance::Normal,
        )
        .unwrap();

        assert_eq!(annotation.anchor_kind, AnnotationAnchorKind::PdfPage);
        assert_eq!(annotation.segment_uid, pdf_page_annotation_segment_uid(2));
        assert_eq!(
            annotation
                .segment_snapshot
                .as_ref()
                .and_then(|snapshot| snapshot.bbox),
            Some([90.0, 200.0, 420.0, 290.0])
        );
    }

    #[test]
    fn rejects_invalid_pdf_page_selection() {
        let mut invalid = selection();
        invalid.rects = vec![[100.0, 200.0, 100.0, 240.0]];

        assert_eq!(
            Annotation::new_for_pdf_page(invalid, "highlight", "", AnnotationImportance::Normal,)
                .unwrap_err(),
            DomainError::PdfAnnotationSelectionRectInvalid { index: 0 }
        );
    }
}
