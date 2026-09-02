//! 解析器产物模块：定义一次 PDF 解析的顶层结果。
//!
//! `NeuinkDocument` 是整份解析文档的容器，包含 schema 版本与
//! 本次解析生成的全部 `SourceSegment`。

use serde::{Deserialize, Serialize};

use crate::SourceSegment;

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct NeuinkDocument {
    pub schema_version: u16,
    pub segments: Vec<SourceSegment>,
}

impl NeuinkDocument {
    pub fn new(segments: Vec<SourceSegment>) -> Self {
        Self {
            schema_version: 1,
            segments,
        }
    }
}
