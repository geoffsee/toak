use crate::embeddings_generator::EmbeddingsGenerator;
use crate::text_chunker::{chunk_text, ChunkerConfig};
use crate::token_cleaner::clean_and_redact;
use anyhow::Result;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Arc;
use tokio::fs;
use tokio::sync::{Mutex, Semaphore};

/// Metadata for a file chunk
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChunkMetadata {
    pub chunk_index: usize,
    pub total_chunks: usize,
    pub file_size: u64,
    pub last_modified: Option<String>,
    pub start_index: usize,
    pub end_index: usize,
}

/// A chunk of file content with its embedding
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EmbeddedChunk {
    pub file_path: String,
    pub content: String,
    pub embedding: Vec<f32>,
    pub metadata: ChunkMetadata,
}

/// The complete JSON database structure
#[derive(Debug, Serialize, Deserialize)]
pub struct EmbeddingsDatabase {
    pub version: String,
    pub generated_at: String,
    pub model: String,
    pub chunk_size: usize,
    pub overlap_size: usize,
    pub total_files: usize,
    pub total_chunks: usize,
    pub chunks: Vec<EmbeddedChunk>,
}

/// Options for JSON database generation
pub struct JsonDatabaseOptions {
    pub dir: PathBuf,
    pub output_file_path: PathBuf,
    pub file_type_exclusions: HashSet<String>,
    pub file_exclusions: Vec<String>,
    pub verbose: bool,
    pub chunker_config: ChunkerConfig,
    /// Maximum number of files to process concurrently
    pub max_concurrent_files: usize,
}

impl Default for JsonDatabaseOptions {
    fn default() -> Self {
        Self {
            dir: PathBuf::from("."),
            output_file_path: PathBuf::from("embeddings.json"),
            file_type_exclusions: Default::default(),
            file_exclusions: Default::default(),
            verbose: true,
            chunker_config: ChunkerConfig::default(),
            max_concurrent_files: 4,
        }
    }
}

/// Generator for creating JSON database with embeddings
pub struct JsonDatabaseGenerator {
    options: JsonDatabaseOptions,
    embeddings_generator: Arc<Mutex<EmbeddingsGenerator>>,
}

impl JsonDatabaseGenerator {
    /// Creates a new JSON database generator
    pub fn new(options: JsonDatabaseOptions) -> Result<Self> {
        let embeddings_generator = Arc::new(Mutex::new(EmbeddingsGenerator::new()?));

        Ok(Self {
            options,
            embeddings_generator,
        })
    }

    /// Gets tracked files from git
    async fn get_tracked_files(&self) -> Result<Vec<String>> {
        self.get_tracked_files_internal().await
    }

    async fn get_tracked_files_internal(&self) -> Result<Vec<String>> {
        // Run git ls-files
        let output = Command::new("git")
            .arg("ls-files")
            .current_dir(&self.options.dir)
            .output()?;

        if !output.status.success() {
            return Err(anyhow::anyhow!("git ls-files failed"));
        }

        let output_str = String::from_utf8(output.stdout)?;
        let tracked_files: Vec<String> = output_str
            .lines()
            .filter(|line| !line.trim().is_empty())
            .map(|s| s.to_string())
            .collect();

        if self.options.verbose {
            println!("Total tracked files: {}", tracked_files.len());
        }

        let total_files = tracked_files.len();

        // Filter by exclusions
        let filtered_files = tracked_files
            .into_iter()
            .filter(|file| {
                let path = Path::new(file);
                let ext = path
                    .extension()
                    .and_then(|e| e.to_str())
                    .map(|e| format!(".{}", e))
                    .unwrap_or_default();

                // Check if file type is excluded
                if self.options.file_type_exclusions.contains(&ext) {
                    return false;
                }

                // Check if file matches exclusion patterns
                !self.matches_exclusion_patterns(file)
            })
            .collect::<Vec<_>>();

        if self.options.verbose {
            println!("Excluded files: {}", total_files - filtered_files.len());
            println!(
                "Files to process for embeddings: {}",
                filtered_files.len()
            );
        }

        Ok(filtered_files)
    }

    fn matches_exclusion_patterns(&self, file: &str) -> bool {
        for pattern in &self.options.file_exclusions {
            if self.glob_match(pattern, file) {
                return true;
            }
        }
        false
    }

    fn glob_match(&self, pattern: &str, path: &str) -> bool {
        use regex::Regex;
        let pattern = pattern
            .replace("**", ".*")
            .replace("*", "[^/]*")
            .replace("?", "[^/]");
        let pattern = format!("^{}$", pattern);

        if let Ok(re) = Regex::new(&pattern) {
            re.is_match(path)
        } else {
            false
        }
    }

    /// Generates the JSON database with embeddings
    pub async fn generate_database(&self) -> Result<JsonDatabaseResult> {
        let tracked_files = self.get_tracked_files().await?;

        if self.options.verbose {
            println!("Generating embeddings for {} files", tracked_files.len());
            println!("Processing with max {} concurrent files", self.options.max_concurrent_files);
        }

        // Create a semaphore to limit concurrent file processing
        let semaphore = Arc::new(Semaphore::new(self.options.max_concurrent_files));

        // Process files concurrently
        let mut tasks = Vec::new();

        for (file_idx, file) in tracked_files.iter().enumerate() {
            let absolute_path = self.options.dir.join(file);
            let file = file.clone();
            let semaphore = semaphore.clone();
            let generator = self.embeddings_generator.clone();
            let chunker_config = self.options.chunker_config.clone();
            let verbose = self.options.verbose;
            let total_files = tracked_files.len();

            let task = tokio::spawn(async move {
                // Acquire semaphore permit
                let _permit = semaphore.acquire().await.unwrap();

                if verbose {
                    println!("Processing file {}/{}: {}", file_idx + 1, total_files, file);
                }

                match Self::process_file_static(&absolute_path, &file, generator, &chunker_config, verbose).await {
                    Ok(chunks) => Ok(chunks),
                    Err(e) => {
                        if verbose {
                            eprintln!("Error processing file {}: {}", file, e);
                        }
                        Err(e)
                    }
                }
            });

            tasks.push(task);
        }

        // Wait for all tasks to complete and collect results
        let mut all_chunks = Vec::new();
        let mut total_chunks_count = 0;

        for task in tasks {
            match task.await {
                Ok(Ok(mut chunks)) => {
                    total_chunks_count += chunks.len();
                    all_chunks.append(&mut chunks);
                }
                Ok(Err(_)) => {
                    // Error already logged in task
                }
                Err(e) => {
                    if self.options.verbose {
                        eprintln!("Task join error: {}", e);
                    }
                }
            }
        }

        if self.options.verbose {
            println!("Total chunks generated: {}", total_chunks_count);
        }

        let database = EmbeddingsDatabase {
            version: "1.0".to_string(),
            generated_at: Utc::now().to_rfc3339(),
            model: "EmbeddingGemma300M".to_string(),
            chunk_size: self.options.chunker_config.chunk_size,
            overlap_size: self.options.chunker_config.overlap_size,
            total_files: tracked_files.len(),
            total_chunks: total_chunks_count,
            chunks: all_chunks,
        };

        // Write to JSON file
        let json = serde_json::to_string_pretty(&database)?;
        fs::write(&self.options.output_file_path, json).await?;

        if self.options.verbose {
            println!(
                "JSON database created at {}",
                self.options.output_file_path.display()
            );
        }

        Ok(JsonDatabaseResult {
            success: true,
            total_files: tracked_files.len(),
            total_chunks: total_chunks_count,
        })
    }

    /// Processes a single file: chunks it and generates embeddings (static version for async tasks)
    async fn process_file_static(
        file_path: &Path,
        relative_path: &str,
        embeddings_generator: Arc<Mutex<EmbeddingsGenerator>>,
        chunker_config: &ChunkerConfig,
        verbose: bool,
    ) -> Result<Vec<EmbeddedChunk>> {
        // Read file content
        let content = fs::read_to_string(file_path).await?;
        let content = clean_and_redact(&content);

        if content.trim().is_empty() {
            return Ok(vec![]);
        }

        // Get file metadata
        let metadata = fs::metadata(file_path).await?;
        let file_size = metadata.len();

        let last_modified = metadata
            .modified()
            .ok()
            .and_then(|time| {
                let datetime: DateTime<Utc> = time.into();
                Some(datetime.to_rfc3339())
            });

        // Chunk the file content
        let text_chunks = chunk_text(&content, chunker_config);
        let total_chunks = text_chunks.len();

        if text_chunks.is_empty() {
            return Ok(vec![]);
        }

        // Prepare texts for batch embedding
        let chunk_texts: Vec<&str> = text_chunks.iter().map(|c| c.content.as_str()).collect();

        if verbose {
            println!("  - Generating embeddings for {} chunks", total_chunks);
        }

        // Generate embeddings in batch (acquire lock for embedding generation)
        let embeddings = {
            let mut gen = embeddings_generator.lock().await;
            gen.generate_embeddings(chunk_texts, None)?
        };

        // Combine chunks with embeddings
        let embedded_chunks: Vec<EmbeddedChunk> = text_chunks
            .into_iter()
            .zip(embeddings.into_iter())
            .map(|(text_chunk, embedding)| EmbeddedChunk {
                file_path: relative_path.to_string(),
                content: text_chunk.content,
                embedding,
                metadata: ChunkMetadata {
                    chunk_index: text_chunk.chunk_index,
                    total_chunks,
                    file_size,
                    last_modified: last_modified.clone(),
                    start_index: text_chunk.start_index,
                    end_index: text_chunk.end_index,
                },
            })
            .collect();

        Ok(embedded_chunks)
    }
}

#[derive(Debug, Clone)]
pub struct JsonDatabaseResult {
    pub success: bool,
    pub total_files: usize,
    pub total_chunks: usize,
}
