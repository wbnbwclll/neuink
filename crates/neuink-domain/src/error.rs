//! 领域错误模块：定义整个领域层统一的错误类型。
//!
//! `DomainError` 汇总各模型在校验与状态流转中产生的领域级错误，
//! 供上层（workspace / ipc）直接使用或转换为字符串错误返回。

use thiserror::Error;

#[derive(Debug, Error, PartialEq, Eq)]
pub enum DomainError {
    #[error("entry title is required")]
    EntryTitleRequired,
    #[error("fields must not contain reserved key `title`")]
    FieldTitleForbidden,
    #[error("tag name is required")]
    TagNameRequired,
    #[error("segment note text exceeds {max} characters: {actual}")]
    SegmentNoteTooLong { actual: usize, max: usize },
    #[error("PDF annotation selection text is required")]
    PdfAnnotationSelectionTextRequired,
    #[error("PDF annotation selection must contain at least one rectangle")]
    PdfAnnotationSelectionRectsRequired,
    #[error("PDF annotation selection rectangle {index} is invalid")]
    PdfAnnotationSelectionRectInvalid { index: usize },
    #[error("unsupported PDF annotation highlight color: {0}")]
    PdfAnnotationHighlightColorUnsupported(String),
    #[error("invalid PDF parse state transition from {from:?} to {to:?}")]
    InvalidPdfParseTransition {
        from: crate::PdfParseStatus,
        to: crate::PdfParseStatus,
    },
}
