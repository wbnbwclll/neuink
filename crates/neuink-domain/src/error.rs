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
    #[error("invalid PDF parse state transition from {from:?} to {to:?}")]
    InvalidPdfParseTransition {
        from: crate::PdfParseStatus,
        to: crate::PdfParseStatus,
    },
}
