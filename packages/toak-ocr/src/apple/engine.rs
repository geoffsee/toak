use async_trait::async_trait;

use crate::engine::{OcrEngine, OcrError, OcrInput, OcrOutput};
use crate::region::TextRegion;

use super::ffi;

pub struct AppleOcrEngine;

impl AppleOcrEngine {
    pub fn new() -> Self {
        Self
    }
}

impl Default for AppleOcrEngine {
    fn default() -> Self {
        Self::new()
    }
}

fn build_output(regions: Vec<TextRegion>) -> OcrOutput {
    let text = regions
        .iter()
        .map(|r| r.text.as_str())
        .collect::<Vec<_>>()
        .join("\n");
    OcrOutput { text, regions }
}

#[async_trait]
impl OcrEngine for AppleOcrEngine {
    async fn recognize(&self, input: &OcrInput) -> Result<OcrOutput, OcrError> {
        match input {
            OcrInput::FilePath(path) => {
                let path = path.clone();
                let regions =
                    tokio::task::spawn_blocking(move || ffi::recognize_file(&path))
                        .await
                        .map_err(|e| OcrError::EngineError(e.to_string()))??;
                Ok(build_output(regions))
            }
            OcrInput::Bytes(data) => {
                let data = data.clone();
                let regions =
                    tokio::task::spawn_blocking(move || ffi::recognize_bytes(&data))
                        .await
                        .map_err(|e| OcrError::EngineError(e.to_string()))??;
                Ok(build_output(regions))
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[tokio::test]
    async fn test_recognize_pdf_file() {
        let pdf_path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("test_sample.pdf");
        if !pdf_path.exists() {
            eprintln!("skipping test: test_sample.pdf not found");
            return;
        }
        let engine = AppleOcrEngine::new();
        let input = OcrInput::FilePath(pdf_path);
        let output = engine.recognize(&input).await.unwrap();
        println!("OCR text:\n{}", output.text);
        println!("Regions: {}", output.regions.len());
        for r in &output.regions {
            println!("  [{:?}] {}", r.confidence, r.text);
        }
        assert!(!output.text.is_empty(), "expected some text from PDF");
    }

    #[tokio::test]
    async fn test_recognize_pdf_bytes() {
        let pdf_path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("test_sample.pdf");
        if !pdf_path.exists() {
            eprintln!("skipping test: test_sample.pdf not found");
            return;
        }
        let bytes = std::fs::read(&pdf_path).unwrap();
        let engine = AppleOcrEngine::new();
        let input = OcrInput::Bytes(bytes);
        let output = engine.recognize(&input).await.unwrap();
        assert!(!output.text.is_empty(), "expected some text from PDF bytes");
    }

    #[tokio::test]
    async fn test_recognize_image_file() {
        let img_path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("test_sample.png");
        if !img_path.exists() {
            eprintln!("skipping test: test_sample.png not found");
            return;
        }
        let engine = AppleOcrEngine::new();
        let input = OcrInput::FilePath(img_path);
        let output = engine.recognize(&input).await.unwrap();
        println!("OCR text:\n{}", output.text);
        assert!(!output.text.is_empty(), "expected some text from image");
    }

    #[tokio::test]
    async fn test_recognize_image_bytes() {
        let img_path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("test_sample.png");
        if !img_path.exists() {
            eprintln!("skipping test: test_sample.png not found");
            return;
        }
        let bytes = std::fs::read(&img_path).unwrap();
        let engine = AppleOcrEngine::new();
        let input = OcrInput::Bytes(bytes);
        let output = engine.recognize(&input).await.unwrap();
        assert!(!output.text.is_empty(), "expected some text from image bytes");
    }
}
