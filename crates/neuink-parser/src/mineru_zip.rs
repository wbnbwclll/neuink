use std::io::{Cursor, Read};

use neuink_domain::NeuinkDocument;
use serde_json::{json, Value};
use zip::ZipArchive;

use crate::{
    mineru_middle::enrich_document_with_middle, normalizer::normalize_parser_response, ParserError,
};

pub fn normalize_mineru_zip(zip_bytes: &[u8]) -> Result<NeuinkDocument, ParserError> {
    let mut archive = ZipArchive::new(Cursor::new(zip_bytes))?;
    let names = (0..archive.len())
        .filter_map(|index| {
            archive
                .by_index(index)
                .ok()
                .map(|file| file.name().to_string())
        })
        .collect::<Vec<_>>();

    for matcher in [is_content_list_v2_file, is_content_list_file] {
        for name in names.iter().filter(|name| matcher(name)) {
            let mut file = archive.by_name(name)?;
            let mut content = String::new();
            file.read_to_string(&mut content)?;
            let value = serde_json::from_str::<Value>(&content)?;
            let wrapped = if is_content_list_v2_file(name) {
                json!({ "content_list_v2": value })
            } else {
                json!({ "content_list": value })
            };
            let mut document = normalize_parser_response(&wrapped)?;
            drop(file);
            enrich_from_middle_file(&mut archive, &names, &mut document)?;
            return Ok(document);
        }
    }

    Err(ParserError::MissingContentList)
}

fn enrich_from_middle_file(
    archive: &mut ZipArchive<Cursor<&[u8]>>,
    names: &[String],
    document: &mut NeuinkDocument,
) -> Result<(), ParserError> {
    let Some(name) = names.iter().find(|name| name.ends_with("_middle.json")) else {
        return Ok(());
    };
    let mut file = archive.by_name(name)?;
    let mut content = String::new();
    file.read_to_string(&mut content)?;
    let middle = serde_json::from_str::<Value>(&content)?;
    enrich_document_with_middle(document, &middle);
    Ok(())
}

fn is_content_list_v2_file(name: &str) -> bool {
    let name = name.to_ascii_lowercase();
    name.ends_with("_content_list_v2.json") || name.ends_with("content_list_v2.json")
}

fn is_content_list_file(name: &str) -> bool {
    let name = name.to_ascii_lowercase();
    !is_content_list_v2_file(&name)
        && (name.ends_with("_content_list.json") || name.ends_with("content_list.json"))
}

#[cfg(test)]
mod tests {
    use std::io::{Cursor, Write};

    use zip::{write::SimpleFileOptions, ZipWriter};

    use super::normalize_mineru_zip;

    #[test]
    fn normalizes_content_list_from_client_zip() {
        let mut writer = ZipWriter::new(Cursor::new(Vec::new()));
        writer
            .start_file("paper_content_list.json", SimpleFileOptions::default())
            .unwrap();
        writer
            .write_all(br#"[{"type":"text","text":"Hello","page_idx":2,"bbox":[1,2,3,4]}]"#)
            .unwrap();
        let zip_bytes = writer.finish().unwrap().into_inner();

        let document = normalize_mineru_zip(&zip_bytes).unwrap();

        assert_eq!(document.segments.len(), 1);
        assert_eq!(document.segments[0].text, "Hello");
        assert_eq!(document.segments[0].page_idx, 2);
    }
}
