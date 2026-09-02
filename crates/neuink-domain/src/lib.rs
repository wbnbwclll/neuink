//! # neuink-domain
//!
//! 领域层 crate：定义整个应用的核心领域模型与错误，是其他 crate（workspace / ipc）的底层依赖。
//!
//! 本 crate 只描述"领域对象是什么"（Entry、PDF、源片段、标注、引用、标签、笔记及其 ID），
//! **不含**任何存储、IO 或网络逻辑，也不产生 `thiserror`/`serde` 之外的运行时依赖。
//!
//! 模块一览：
//! - [`ids`]：强类型 ID 基石
//! - [`entry`]：文献条目及其内容项
//! - [`pdf`]：PDF 资产与解析状态机
//! - [`segment`]：PDF 源片段（RAG / 引用最小单元）
//! - [`segment_note`]：附着在源片段上的笔记
//! - [`annotation`]：对源片段的结构化标注
//! - [`source_link`]：笔记对源片段的引用链接
//! - [`tag`]：层级标签树节点
//! - [`parser`]：解析器顶层产物
//! - [`error`]：统一的领域错误

pub mod annotation;
pub mod entry;
pub mod error;
pub mod ids;
pub mod parser;
pub mod pdf;
pub mod segment;
pub mod segment_note;
pub mod source_link;
pub mod tag;

pub use annotation::{
    Annotation, AnnotationImportance, AnnotationSegmentSnapshot, AnnotationTextSelection,
};
pub use entry::{ContentItem, EntryMeta};
pub use error::DomainError;
pub use ids::{AnnotationId, ConversationId, EntryId, NoteId, SegmentUid, SourceLinkId, TagId};
pub use parser::NeuinkDocument;
pub use pdf::{PdfAsset, PdfParseState, PdfParseStatus};
pub use segment::{SegmentType, SourceSegment};
pub use segment_note::SegmentBlockNote;
pub use source_link::{LinkOwner, SegmentRef, SourceLink};
pub use tag::TagMeta;
