//! # toak-rs
//!
//! A high-performance library for tokenizing git repositories, generating markdown documentation,
//! and creating semantic embeddings for code repositories.
//!
//! ## Features
//!
//! - **Code Cleaning & Secret Redaction**: Remove comments, imports, and sensitive information (API keys, tokens, passwords)
//! - **Tokenization**: Count tokens in code for LLM context window estimation
//! - **Text Chunking**: Split text into overlapping chunks optimized for embeddings and RAG applications
//! - **Embeddings Generation**: Create semantic vector embeddings for code chunks
//! - **Markdown Generation**: Convert repositories into well-structured markdown documentation
//! - **High Performance**: Built in Rust with concurrent file processing and no runtime dependencies
//!
//! ## Quick Start
//!
//! ```ignore
//! use toak_rs::prelude::*;
//!
//! // Clean and redact code
//! let cleaned = clean_and_redact("let api_key = 'sk-1234567890';");
//! assert!(!cleaned.contains("sk-"));
//!
//! // Generate embeddings
//! let mut generator = EmbeddingsGenerator::new()?;
//! let embedding = generator.generate_embedding("let x = 5;")?;
//!
//! // Chunk text for RAG
//! let chunks = chunk_text("Hello world", &ChunkerConfig::default());
//!
//! // Perform semantic search on embeddings
//! let mut search = SemanticSearch::new("embeddings.json")?;
//! let results = search.search("find rust code", 5)?;
//! for result in results {
//!     println!("{}: {:.4}", result.file_path, result.similarity);
//! }
//! ```

pub mod embeddings_generator;
pub mod json_database_generator;
pub mod markdown_generator;
pub mod semantic_search;
pub mod text_chunker;
pub mod token_cleaner;

// Re-export commonly used types at the root level
pub use embeddings_generator::EmbeddingsGenerator;
pub use json_database_generator::{ChunkMetadata, EmbeddedChunk, EmbeddingsDatabase, JsonDatabaseGenerator, JsonDatabaseOptions, JsonDatabaseResult};
pub use markdown_generator::{MarkdownGenerator, MarkdownGeneratorOptions, MarkdownResult};
pub use semantic_search::{EmbeddingChunk, EmbeddingsDatabaseMetadata, SearchResult, SemanticSearch};
pub use text_chunker::{chunk_text, ChunkerConfig, TextChunk};
pub use token_cleaner::{clean_and_redact, clean_code, count_tokens, redact_secrets};

/// Prelude module for convenient imports
///
/// Import everything you need with:
/// ```ignore
/// use toak_rs::prelude::*;
/// ```
pub mod prelude {
    pub use crate::{
        chunk_text, clean_and_redact, clean_code, count_tokens, redact_secrets, ChunkMetadata, ChunkerConfig,
        EmbeddedChunk, EmbeddingChunk, EmbeddingsDatabase, EmbeddingsDatabaseMetadata, EmbeddingsGenerator,
        JsonDatabaseGenerator, JsonDatabaseOptions, JsonDatabaseResult, MarkdownGenerator,
        MarkdownGeneratorOptions, MarkdownResult, SearchResult, SemanticSearch, TextChunk,
    };
}