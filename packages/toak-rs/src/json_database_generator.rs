//! Helpers that walk a git repository, chunk the code, and persist embeddings into a JSON database.
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
use std::time::Instant;
use tokio::fs;
use tokio::sync::{Semaphore};
use tokio::sync::{mpsc, oneshot};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::mpsc as std_mpsc;

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

/// A chunk staged for embedding (no vector yet)
#[derive(Debug, Clone)]
struct PendingChunk {
    file_path: String,
    content: String,
    metadata: ChunkMetadata,
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
    /// Number of parallel embedding workers (each maintains its own model instance)
    pub embedding_pool_size: usize,
    /// Optional batch size hint passed to the embedding backend
    pub embedding_batch_size: Option<usize>,
}

impl Default for JsonDatabaseOptions {
    fn default() -> Self {
        // Choose a conservative default worker pool size based on available CPU cores,
        // but cap to avoid excessive memory usage from multiple model instances.
        let cpu_count = std::thread::available_parallelism()
            .map(|n| n.get())
            .unwrap_or(4);
        let default_pool = cpu_count.min(4).max(1);

        Self {
            dir: PathBuf::from("."),
            output_file_path: PathBuf::from("embeddings.json"),
            file_type_exclusions: Default::default(),
            file_exclusions: Default::default(),
            verbose: true,
            chunker_config: ChunkerConfig::default(),
            max_concurrent_files: 4,
            embedding_pool_size: default_pool,
            embedding_batch_size: None,
        }
    }
}

/// Generator for creating JSON database with embeddings
pub struct JsonDatabaseGenerator {
    options: JsonDatabaseOptions,
    embeddings_pool: EmbeddingPool,
}

impl JsonDatabaseGenerator {
    /// Creates a new JSON database generator
    pub fn new(options: JsonDatabaseOptions) -> Result<Self> {
        // Build a pool of embedding workers that each own their model instance.
        // Workers live on dedicated threads and communicate via channels — no mutex around the model.
        let embeddings_pool = EmbeddingPool::new(options.embedding_pool_size)?;

        Ok(Self {
            options,
            embeddings_pool,
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

    /// Generates the JSON database with embeddings and writes it to disk.
    pub async fn generate_database(&self) -> Result<JsonDatabaseResult> {
        let overall_start = Instant::now();
        let tracked_files = self.get_tracked_files().await?;

        if self.options.verbose {
            println!("Generating embeddings for {} files", tracked_files.len());
            println!("Processing with max {} concurrent files", self.options.max_concurrent_files);
        }

        // Create a semaphore to limit concurrent file processing
        let semaphore = Arc::new(Semaphore::new(self.options.max_concurrent_files));

        // Stage chunks from files concurrently (no embedding yet)
        let stage_start = Instant::now();
        let mut tasks = Vec::new();
        for (file_idx, file) in tracked_files.iter().enumerate() {
            let absolute_path = self.options.dir.join(file);
            let file = file.clone();
            let semaphore = semaphore.clone();
            let chunker_config = self.options.chunker_config.clone();
            let verbose = self.options.verbose;
            let total_files = tracked_files.len();

            let task = tokio::spawn(async move {
                // Acquire semaphore permit
                let _permit = semaphore.acquire().await.unwrap();

                if verbose {
                    println!("Processing file {}/{}: {}", file_idx + 1, total_files, file);
                }

                match Self::process_file_stage_chunks(&absolute_path, &file, &chunker_config, verbose).await {
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

        // Collect all pending chunks in stable order of file tasks finishing; order within file preserved by processing
        let mut pending_chunks: Vec<PendingChunk> = Vec::new();
        for task in tasks {
            match task.await {
                Ok(Ok(mut chunks)) => {
                    pending_chunks.append(&mut chunks);
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

        let stage_elapsed = stage_start.elapsed();
        let total_chunks_count = pending_chunks.len();
        let staged_bytes: usize = pending_chunks.iter().map(|c| c.content.len()).sum();

        if self.options.verbose {
            let secs = stage_elapsed.as_secs_f64().max(1e-9);
            let chunks_per_sec = total_chunks_count as f64 / secs;
            let mb = staged_bytes as f64 / (1024.0 * 1024.0);
            println!(
                "[perf] Staging: files={}, chunks={}, bytes={:.2} MiB, time={:.3}s, throughput={:.1} chunks/s",
                tracked_files.len(), total_chunks_count, mb, stage_elapsed.as_secs_f64(), chunks_per_sec
            );
        }

        if total_chunks_count == 0 {
            if self.options.verbose {
                println!("No chunks produced; writing empty database.");
            }
            let database = EmbeddingsDatabase {
                version: "1.0".to_string(),
                generated_at: Utc::now().to_rfc3339(),
                model: "EmbeddingGemma300M".to_string(),
                chunk_size: self.options.chunker_config.chunk_size,
                overlap_size: self.options.chunker_config.overlap_size,
                total_files: tracked_files.len(),
                total_chunks: 0,
                chunks: vec![],
            };
            let json = serde_json::to_string_pretty(&database)?;
            fs::write(&self.options.output_file_path, json).await?;
            return Ok(JsonDatabaseResult { success: true, total_files: tracked_files.len(), total_chunks: 0 });
        }

        if self.options.verbose {
            println!("Staged {} chunks; generating embeddings in global batches...", total_chunks_count);
        }

        // Build documents list
        let documents: Vec<String> = pending_chunks.iter().map(|pc| pc.content.clone()).collect();

        // Perform global batched embedding across the pool
        let embed_start = Instant::now();
        let backend_batch_size = self.options.embedding_batch_size;
        let per_job_batch = 2048usize; // cross-file batch size per worker job
        if self.options.verbose {
            println!(
                "[perf] Embedding config: pool_size={}, per_job_batch={}, backend_batch_size={:?}",
                self.options.embedding_pool_size, per_job_batch, backend_batch_size
            );
        }
        let embeddings = self
            .embeddings_pool
            .embed_many_ordered(documents, Some(per_job_batch), backend_batch_size)
            .await?;
        let embed_elapsed = embed_start.elapsed();
        if self.options.verbose {
            let secs = embed_elapsed.as_secs_f64().max(1e-9);
            let chunks_per_sec = total_chunks_count as f64 / secs;
            println!(
                "[perf] Embedding: chunks={}, time={:.3}s, throughput={:.1} chunks/s",
                total_chunks_count, embed_elapsed.as_secs_f64(), chunks_per_sec
            );
        }

        // Zip back into embedded chunks
        let mut all_chunks: Vec<EmbeddedChunk> = Vec::with_capacity(total_chunks_count);
        for (i, pending) in pending_chunks.into_iter().enumerate() {
            let embedding = embeddings.get(i)
                .cloned()
                .ok_or_else(|| anyhow::anyhow!("missing embedding for chunk {}", i))?;
            all_chunks.push(EmbeddedChunk {
                file_path: pending.file_path,
                content: pending.content,
                embedding,
                metadata: pending.metadata,
            });
        }

        if self.options.verbose {
            println!("Total chunks generated: {}", all_chunks.len());
        }

        let database = EmbeddingsDatabase {
            version: "1.0".to_string(),
            generated_at: Utc::now().to_rfc3339(),
            model: "EmbeddingGemma300M".to_string(),
            chunk_size: self.options.chunker_config.chunk_size,
            overlap_size: self.options.chunker_config.overlap_size,
            total_files: tracked_files.len(),
            total_chunks: all_chunks.len(),
            chunks: all_chunks,
        };

        // Write to JSON file
        let write_start = Instant::now();
        let json = serde_json::to_string_pretty(&database)?;
        fs::write(&self.options.output_file_path, json).await?;
        let write_elapsed = write_start.elapsed();

        if self.options.verbose {
            println!(
                "JSON database created at {}",
                self.options.output_file_path.display()
            );
            let total_elapsed = overall_start.elapsed();
            let stage = stage_elapsed.as_secs_f64();
            let embed = embed_elapsed.as_secs_f64();
            let write = write_elapsed.as_secs_f64();
            let total = total_elapsed.as_secs_f64();
            println!(
                "[perf] Totals: time={:.3}s (stage={:.3}s, embed={:.3}s, write={:.3}s)",
                total, stage, embed, write
            );
            if total > 0.0 {
                println!(
                    "[perf] Breakdown: stage={:.0}%, embed={:.0}%, write={:.0}%",
                    (stage / total * 100.0).round(),
                    (embed / total * 100.0).round(),
                    (write / total * 100.0).round()
                );
            }
        }

        Ok(JsonDatabaseResult {
            success: true,
            total_files: tracked_files.len(),
            total_chunks: database.total_chunks,
        })
    }

    /// Processes a single file by chunking, cleaning, and generating embeddings.
    async fn process_file_stage_chunks(
        file_path: &Path,
        relative_path: &str,
        chunker_config: &ChunkerConfig,
        verbose: bool,
    ) -> Result<Vec<PendingChunk>> {
        // Read file content
        let content = fs::read_to_string(file_path).await?;
        let content = clean_and_redact(&content);

        if content.trim().is_empty() { return Ok(vec![]); }

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

        if text_chunks.is_empty() { return Ok(vec![]); }

        if verbose { println!("  - Staged {} chunks", total_chunks); }

        // Build pending chunks (no embeddings yet)
        let pending: Vec<PendingChunk> = text_chunks
            .into_iter()
            .map(|text_chunk| PendingChunk {
                file_path: relative_path.to_string(),
                content: text_chunk.content,
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

        Ok(pending)
    }
}

// ================= Embedding worker pool (no global mutex) =================

struct EmbeddingJob {
    texts: Vec<String>,
    batch_size: Option<usize>,
    resp: oneshot::Sender<Result<Vec<Vec<f32>>>>,
}

#[derive(Clone)]
struct EmbeddingPool(Arc<EmbeddingPoolInner>);

struct EmbeddingPoolInner {
    senders: Vec<mpsc::Sender<EmbeddingJob>>, // per-worker input queues
    next: AtomicUsize,
}

impl EmbeddingPool {
    fn new(pool_size: usize) -> Result<Self> {
        let size = pool_size.max(1);
        let mut senders = Vec::with_capacity(size);
        let mut readiness_rxs = Vec::with_capacity(size);

        for worker_id in 0..size {
            // Increase queue capacity to reduce backpressure causing transient send failures.
            let (tx, mut rx) = mpsc::channel::<EmbeddingJob>(32);
            // One-shot readiness signal from worker -> pool (std mpsc so we can recv_timeout)
            let (ready_tx, ready_rx) = std_mpsc::channel::<Result<()>>();
            // Spawn a dedicated OS thread for the worker so heavy compute doesn't block the async runtime.
            std::thread::spawn(move || {
                // Initialize the model inside the worker thread.
                let mut generator = match EmbeddingsGenerator::new() {
                    Ok(g) => {
                        // Signal readiness to the pool
                        let _ = ready_tx.send(Ok(()));
                        g
                    }
                    Err(e) => {
                        // Signal initialization failure to the pool and exit
                        let _ = ready_tx.send(Err(anyhow::anyhow!(format!(
                            "embedding worker {} init failed: {}",
                            worker_id, e
                        ))));
                        return;
                    }
                };

                // Process jobs synchronously on this thread
                while let Some(job) = rx.blocking_recv() {
                    // Convert owned strings to &str slice for the backend
                    let texts_refs: Vec<&str> = job.texts.iter().map(|s| s.as_str()).collect();
                    // Catch panics inside the worker so callers receive a proper error instead of a dropped channel.
                    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                        generator
                            .generate_embeddings(texts_refs, job.batch_size)
                    }))
                    .map_err(|_| anyhow::anyhow!("embedding worker {} panicked during generate", worker_id))
                    .and_then(|res| res.map_err(|e| anyhow::anyhow!(e)));

                    let _ = job.resp.send(result);
                }
            });

            senders.push(tx);
            readiness_rxs.push(ready_rx);
        }

        // Await readiness for all workers with a timeout so we don't build a broken pool
        let init_timeout_secs: u64 = std::env::var("TOAK_EMBED_INIT_TIMEOUT_SECS")
            .ok()
            .and_then(|s| s.parse().ok())
            .unwrap_or(20);
        let start_wait = Instant::now();
        for (idx, rx) in readiness_rxs.into_iter().enumerate() {
            match rx.recv_timeout(std::time::Duration::from_secs(init_timeout_secs)) {
                Ok(Ok(())) => { /* ready */ }
                Ok(Err(e)) => {
                    return Err(anyhow::anyhow!(format!(
                        "embedding pool init failed: worker {} not ready: {}",
                        idx, e
                    )));
                }
                Err(_) => {
                    return Err(anyhow::anyhow!(format!(
                        "embedding pool init timed out after {}s waiting for worker {}",
                        init_timeout_secs, idx
                    )));
                }
            }
        }
        let _elapsed = start_wait.elapsed();

        Ok(Self(Arc::new(EmbeddingPoolInner {
            senders,
            next: AtomicUsize::new(0),
        })))
    }

    async fn embed(&self, texts: Vec<String>, batch_size: Option<usize>) -> Result<Vec<Vec<f32>>> {
        let inner = &self.0;
        let len = inner.senders.len();
        let idx = inner.next.fetch_add(1, Ordering::Relaxed) % len;
        let (resp_tx, resp_rx) = oneshot::channel();
        let job = EmbeddingJob {
            texts,
            batch_size,
            resp: resp_tx,
        };
        inner
            .senders[idx]
            .send(job)
            .await
            .map_err(|e| anyhow::anyhow!(
                "failed to send embedding job: {}. hint: worker may have failed to initialize; try setting ORT_DISABLE_COREML=1 to force CPU or check startup logs.",
                e
            ))?;

        // Optional timeout to avoid hanging forever if a worker wedges.
        let timeout_secs: u64 = std::env::var("TOAK_EMBED_TIMEOUT_SECS")
            .ok()
            .and_then(|s| s.parse().ok())
            .unwrap_or(120);

        match tokio::time::timeout(std::time::Duration::from_secs(timeout_secs), resp_rx).await {
            Ok(Ok(res)) => res,
            Ok(Err(e)) => Err(anyhow::anyhow!("embedding worker dropped: {}", e)),
            Err(_) => Err(anyhow::anyhow!(
                "embedding job timed out after {}s; worker may be stalled",
                timeout_secs
            )),
        }
    }

    /// Embed a large set of texts by slicing into per-job batches and
    /// dispatching them across workers in parallel. Preserves the global order.
    async fn embed_many_ordered(
        &self,
        texts: Vec<String>,
        per_job_batch: Option<usize>,
        batch_size: Option<usize>,
    ) -> Result<Vec<Vec<f32>>> {
        let total = texts.len();
        if total == 0 { return Ok(Vec::new()); }

        let job_batch = per_job_batch.unwrap_or(2048).max(1);
        let mut starts = Vec::new();
        let mut futures = Vec::new();

        let inner = &self.0;
        let workers = inner.senders.len().max(1);
        let mut rr = inner.next.fetch_add(0, Ordering::Relaxed) % workers; // starting point

        // Build jobs and submit round-robin
        let mut i = 0;
        while i < total {
            let end = (i + job_batch).min(total);
            let slice: Vec<String> = texts[i..end].to_vec();
            let worker_idx = rr % workers;
            rr = rr.wrapping_add(1);
            // Send job synchronously so we surface send errors immediately.
            let (resp_tx, resp_rx) = oneshot::channel();
            let job = EmbeddingJob { texts: slice, batch_size, resp: resp_tx };
            let sender = inner.senders[worker_idx].clone();
            sender
                .send(job)
                .await
                .map_err(|e| anyhow::anyhow!(
                    "failed to send embedding job to worker {}: {}. hint: worker may have failed to initialize; try ORT_DISABLE_COREML=1 or check initialization logs.",
                    worker_idx, e
                ))?;
            let rx = resp_rx;
            starts.push(i);
            futures.push(rx);
            i = end;
        }

        let mut out: Vec<Vec<f32>> = (0..total).map(|_| Vec::new()).collect();

        // Await all batches and place into the output vector
        // Await all batches with a timeout to avoid indefinite hangs
        let timeout_secs: u64 = std::env::var("TOAK_EMBED_TIMEOUT_SECS")
            .ok()
            .and_then(|s| s.parse().ok())
            .unwrap_or(120);

        for (start, rx) in starts.into_iter().zip(futures.into_iter()) {
            let batch = match tokio::time::timeout(std::time::Duration::from_secs(timeout_secs), rx).await {
                Ok(Ok(res)) => res?,
                Ok(Err(e)) => return Err(anyhow::anyhow!("embedding worker dropped: {}", e)),
                Err(_) => return Err(anyhow::anyhow!(
                    "embedding batch timed out after {}s; worker may be stalled",
                    timeout_secs
                )),
            };
            for (offset, emb) in batch.into_iter().enumerate() {
                out[start + offset] = emb;
            }
        }

        Ok(out)
    }
}

/// Result returned after a generation run.
#[derive(Debug, Clone)]
pub struct JsonDatabaseResult {
    pub success: bool,
    pub total_files: usize,
    pub total_chunks: usize,
}
