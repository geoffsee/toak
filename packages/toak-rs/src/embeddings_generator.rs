use fastembed::{TextEmbedding, InitOptions, EmbeddingModel};
use anyhow::Result;

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
        let text_embedding = TextEmbedding::try_new(
            InitOptions::new(model).with_show_download_progress(true),
        )?;

        Ok(Self {
            model: text_embedding,
        })
    }

    /// Generates embeddings for a batch of texts
    /// The batch_size parameter can be used to control memory usage
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


