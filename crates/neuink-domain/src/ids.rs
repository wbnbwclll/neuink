//! 强类型 ID 模块：通过同一宏生成一系列字符串 ID 类型。
//!
//! 本模块是整个领域层的"基石"——几乎所有模型都通过 `EntryId`、`SegmentUid` 等
//! 类型来引用彼此，从而把散落的裸字符串 ID 变成强类型，避免类型误用。

use std::fmt::{self, Display};

use serde::{Deserialize, Serialize};

macro_rules! define_id {
    ($name:ident) => {
        #[derive(Clone, Debug, Deserialize, Eq, Hash, Ord, PartialEq, PartialOrd, Serialize)]
        #[serde(transparent)]
        pub struct $name(String);

        impl $name {
            pub fn new() -> Self {
                Self(nanoid::nanoid!(16))
            }

            pub fn from_string(value: impl Into<String>) -> Self {
                Self(value.into())
            }

            pub fn as_str(&self) -> &str {
                &self.0
            }
        }

        impl Default for $name {
            fn default() -> Self {
                Self::new()
            }
        }

        impl Display for $name {
            fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
                formatter.write_str(&self.0)
            }
        }

        impl AsRef<str> for $name {
            fn as_ref(&self) -> &str {
                self.as_str()
            }
        }
    };
}

define_id!(EntryId);
define_id!(NoteId);
define_id!(SegmentUid);
define_id!(AnnotationId);
define_id!(TagId);
define_id!(SourceLinkId);
define_id!(ConversationId);

#[cfg(test)]
mod tests {
    use super::EntryId;

    #[test]
    fn generated_ids_are_16_chars() {
        assert_eq!(EntryId::new().as_str().len(), 16);
    }
}
