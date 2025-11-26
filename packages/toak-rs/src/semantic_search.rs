//! Semantic search functionality for querying embeddings databases.
//!
//! This module provides tools for performing semantic similarity searches
//! against embeddings stored in JSON format.

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::path::Path;

use crate::embeddings_generator::EmbeddingsGenerator;

/// Represents a chunk with its embedding from the embeddings database
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EmbeddingChunk {
    pub file_path: String,
    pub content: String,
    pub embedding: Vec<f32>,
}

/// Metadata about the embeddings database
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EmbeddingsDatabaseMetadata {
    pub version: String,
    pub generated_at: String,
    pub model: String,
    pub chunk_size: usize,
    pub overlap_size: usize,
    pub total_files: usize,
    pub total_chunks: usize,
}

/// The complete embeddings database structure
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EmbeddingsDatabase {
    pub version: String,
    pub generated_at: String,
    pub model: String,
    pub chunk_size: usize,
    pub overlap_size: usize,
    pub total_files: usize,
    pub total_chunks: usize,
    pub chunks: Vec<EmbeddingChunk>,
}

/// A search result containing the chunk and its similarity score
#[derive(Debug, Clone)]
pub struct SearchResult {
    pub file_path: String,
    pub content: String,
    pub similarity: f32,
}

/// Semantic search engine for querying embeddings databases
pub struct SemanticSearch {
    database: EmbeddingsDatabase,
    generator: EmbeddingsGenerator,
}

impl SemanticSearch {
    /// Create a new semantic search instance by loading an embeddings database
    pub fn new<P: AsRef<Path>>(embeddings_path: P) -> Result<Self> {
        let contents = std::fs::read_to_string(embeddings_path.as_ref())
            .context("Failed to read embeddings file")?;

        let database: EmbeddingsDatabase = serde_json::from_str(&contents)
            .context("Failed to parse embeddings JSON")?;

        let generator = EmbeddingsGenerator::new()
            .context("Failed to initialize embeddings generator")?;

        Ok(Self {
            database,
            generator,
        })
    }

    /// Get metadata about the loaded database
    pub fn metadata(&self) -> EmbeddingsDatabaseMetadata {
        EmbeddingsDatabaseMetadata {
            version: self.database.version.clone(),
            generated_at: self.database.generated_at.clone(),
            model: self.database.model.clone(),
            chunk_size: self.database.chunk_size,
            overlap_size: self.database.overlap_size,
            total_files: self.database.total_files,
            total_chunks: self.database.total_chunks,
        }
    }

    /// Perform a semantic search with the given query
    ///
    /// Returns the top N results ranked by cosine similarity
    pub fn search(&mut self, query: &str, top_n: usize) -> Result<Vec<SearchResult>> {
        // Generate embedding for the query
        let query_embedding = self.generator.generate_embedding(query)
            .context("Failed to generate query embedding")?;

        // Calculate similarity scores for all chunks
        let mut results: Vec<SearchResult> = self.database.chunks
            .iter()
            .map(|chunk| {
                let similarity = cosine_similarity(&query_embedding, &chunk.embedding);
                SearchResult {
                    file_path: chunk.file_path.clone(),
                    content: chunk.content.clone(),
                    similarity,
                }
            })
            .collect();

        // Sort by similarity (descending)
        results.sort_by(|a, b| b.similarity.partial_cmp(&a.similarity).unwrap_or(std::cmp::Ordering::Equal));

        // Return top N results
        results.truncate(top_n);

        Ok(results)
    }

    /// Get the total number of chunks in the database
    pub fn chunk_count(&self) -> usize {
        self.database.chunks.len()
    }
}

/// Calculate cosine similarity between two vectors
///
/// Returns a value between -1 and 1, where 1 means identical direction,
/// 0 means orthogonal, and -1 means opposite direction
fn cosine_similarity(a: &[f32], b: &[f32]) -> f32 {
    if a.len() != b.len() {
        return 0.0;
    }

    let dot_product: f32 = a.iter().zip(b.iter()).map(|(x, y)| x * y).sum();
    let magnitude_a: f32 = a.iter().map(|x| x * x).sum::<f32>().sqrt();
    let magnitude_b: f32 = b.iter().map(|x| x * x).sum::<f32>().sqrt();

    if magnitude_a == 0.0 || magnitude_b == 0.0 {
        return 0.0;
    }

    dot_product / (magnitude_a * magnitude_b)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cosine_similarity_identical() {
        let a = vec![1.0, 2.0, 3.0];
        let b = vec![1.0, 2.0, 3.0];
        let similarity = cosine_similarity(&a, &b);
        assert!((similarity - 1.0).abs() < 0.0001);
    }

    #[test]
    fn test_cosine_similarity_orthogonal() {
        let a = vec![1.0, 0.0];
        let b = vec![0.0, 1.0];
        let similarity = cosine_similarity(&a, &b);
        assert!((similarity - 0.0).abs() < 0.0001);
    }

    #[test]
    fn test_cosine_similarity_opposite() {
        let a = vec![1.0, 0.0];
        let b = vec![-1.0, 0.0];
        let similarity = cosine_similarity(&a, &b);
        assert!((similarity - (-1.0)).abs() < 0.0001);
    }

    #[test]
    fn test_cosine_similarity_different_lengths() {
        let a = vec![1.0, 2.0];
        let b = vec![1.0, 2.0, 3.0];
        let similarity = cosine_similarity(&a, &b);
        assert_eq!(similarity, 0.0);
    }
}