use std::path::PathBuf;

use async_trait::async_trait;
use thiserror::Error;

use crate::region::TextRegion;

#[derive(Debug, Clone)]
pub enum OcrInput {
    FilePath(PathBuf),
    Bytes(Vec<u8>),
}

#[derive(Debug, Clone)]
pub struct OcrOutput {
    pub text: String,
    pub regions: Vec<TextRegion>,
}

#[derive(Debug, Error)]
pub enum OcrError {
    #[error("unsupported operation")]
    Unsupported,
    #[error("invalid input: {0}")]
    InvalidInput(String),
    #[error("engine error: {0}")]
    EngineError(String),
}

#[async_trait]
pub trait OcrEngine: Send + Sync {
    async fn recognize(&self, input: &OcrInput) -> Result<OcrOutput, OcrError>;
}
