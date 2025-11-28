//! Utilities for creating semantic embeddings via the `fastembed` crate.
//! This module powers the embedding generation features that back the JSON database
//! exporter and any higher level tooling.
use fastembed::{TextEmbedding, InitOptions, EmbeddingModel};
use anyhow::Result;

/// A builder around `fastembed::TextEmbedding` that exposes simple helpers
/// for generating per-text or batch embeddings.
pub struct EmbeddingsGenerator {
    model: TextEmbedding,
}

impl EmbeddingsGenerator {
    /// Creates a new embeddings generator with the default model
    pub fn new() -> Result<Self> {
        Self::with_model(EmbeddingModel::EmbeddingGemma300M)
    }

    /// Creates a new embeddings generator with a specific model
    pub fn with_model(model: EmbeddingModel) -> Result<Self> {
        // Log the platform/backend hints to help validate acceleration on Apple Silicon.
        #[cfg(all(target_os = "macos", target_arch = "aarch64"))]
        {
            // If built with `ort` CoreML feature, ONNX Runtime should select the CoreML EP
            // when available, falling back to CPU otherwise. We log a hint here.
            eprintln!("[perf] macOS aarch64 build detected; ONNX Runtime CoreML/Metal acceleration is enabled if available.");
            if let Ok(val) = std::env::var("TOAK_EMBED_DEVICE") {
                eprintln!("[perf] TOAK_EMBED_DEVICE={} (informational)", val);
            }
        }

        // Try to initialize the model. On Apple Silicon, if CoreML fails, retry once with CPU.
        #[cfg(all(target_os = "macos", target_arch = "aarch64"))]
        let text_embedding = {
            let try_init = |m: EmbeddingModel| {
                TextEmbedding::try_new(InitOptions::new(m).with_show_download_progress(true))
            };
            match try_init(model.clone()) {
                Ok(ok) => {
                    let coreml_disabled = std::env::var("ORT_DISABLE_COREML").ok().unwrap_or_default();
                    if coreml_disabled == "1" {
                        eprintln!("[perf] ONNX Runtime CoreML disabled by ORT_DISABLE_COREML=1; using CPU backend.");
                    } else {
                        eprintln!("[perf] Attempting CoreML/Metal acceleration (CPU fallback if unavailable)...");
                    }
                    ok
                }
                Err(e) => {
                    eprintln!("[warn] fastembed initialization failed (CoreML path?): {}", e);
                    eprintln!("[warn] Retrying embeddings initialization with CPU backend (disabling CoreML).");
                    std::env::set_var("ORT_DISABLE_COREML", "1");
                    let retried = try_init(model)?;
                    eprintln!("[perf] Fallback successful: using CPU backend for embeddings.");
                    retried
                }
            }
        };

        #[cfg(not(all(target_os = "macos", target_arch = "aarch64")))]
        let text_embedding = TextEmbedding::try_new(
            InitOptions::new(model).with_show_download_progress(true),
        )?;

        Ok(Self {
            model: text_embedding,
        })
    }

    /// Generates embeddings for a batch of texts
    /// The `batch_size` parameter can be used to control memory usage and throughput.
    pub fn generate_embeddings(&mut self, texts: Vec<&str>, batch_size: Option<usize>) -> Result<Vec<Vec<f32>>> {
        let embeddings = self.model.embed(texts, batch_size)?;
        Ok(embeddings)
    }

    /// Generates embedding for a single text
    pub fn generate_embedding(&mut self, text: &str) -> Result<Vec<f32>> {
        let embeddings = self.generate_embeddings(vec![text], None)?;
        embeddings.into_iter().next()
            .ok_or_else(|| anyhow::anyhow!("Failed to generate embedding"))
    }
}
