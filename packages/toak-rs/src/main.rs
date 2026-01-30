mod cli;
mod markdown_generator;
mod token_cleaner;
mod embeddings_generator;
mod text_chunker;
mod json_database_generator;
mod semantic_search;

use clap::Parser;
use cli::{Args, Commands};
use markdown_generator::{MarkdownGenerator, MarkdownGeneratorOptions};
use json_database_generator::{JsonDatabaseGenerator, JsonDatabaseOptions};
use semantic_search::SemanticSearch;

#[tokio::main]
async fn main() {
  let args = Args::parse();

  match args.command {
    Commands::Version => {
      println!("toak {}", env!("CARGO_PKG_VERSION"));
    }
    Commands::Generate {
      dir,
      output_file_path,
      quiet,
      prompt: _,
    } => {
      run_generate(dir, output_file_path, quiet).await;
    }
    Commands::Search {
      query,
      embeddings_file,
      top_n,
      full,
    } => {
      run_search(&query, &embeddings_file, top_n, full);
    }
  }
}

async fn run_generate(
  dir: Option<std::path::PathBuf>,
  output_file_path: Option<std::path::PathBuf>,
  quiet: bool,
) {
  println!("RUNNING TOKENIZER");

  let dir = dir.unwrap_or_else(|| std::path::PathBuf::from("."));
  let output_file_path = output_file_path.unwrap_or_else(|| std::path::PathBuf::from("prompt.md"));
  let verbose = !quiet;

  // Generate markdown document
  let markdown_options = MarkdownGeneratorOptions {
    dir: dir.clone(),
    output_file_path,
    file_type_exclusions: Default::default(),
    file_exclusions: Default::default(),
    verbose,
  };

  let mut markdown_generator = MarkdownGenerator::new(markdown_options);

  match markdown_generator.create_markdown_document().await {
    Ok(result) => {
      if !result.success {
        eprintln!("Markdown generation failed");
        std::process::exit(1);
      }
    }
    Err(e) => {
      eprintln!("Error generating markdown: {}", e);
      std::process::exit(1);
    }
  }

  // Generate JSON database with embeddings
  println!("\nGenerating embeddings database...");

  let embeddings_output_path = dir.join("embeddings.json");
  let json_options = JsonDatabaseOptions {
    dir,
    output_file_path: embeddings_output_path,
    file_type_exclusions: Default::default(),
    file_exclusions: Default::default(),
    verbose,
    chunker_config: Default::default(),
    max_concurrent_files: 4, // Process up to 4 files concurrently
    // Use defaults for embedding pool; override here if desired
    embedding_pool_size: JsonDatabaseOptions::default().embedding_pool_size,
    embedding_batch_size: None,
  };

  let json_generator = match JsonDatabaseGenerator::new(json_options) {
    Ok(generator) => generator,
    Err(e) => {
      eprintln!("Error initializing embeddings generator: {}", e);
      std::process::exit(1);
    }
  };

  match json_generator.generate_database().await {
    Ok(result) => {
      if !result.success {
        eprintln!("Embeddings generation failed");
        std::process::exit(1);
      }
      println!(
        "Successfully generated embeddings for {} files ({} chunks)",
        result.total_files, result.total_chunks
      );
    }
    Err(e) => {
      eprintln!("Error generating embeddings: {}", e);
      std::process::exit(1);
    }
  }

  println!("\n✓ All tasks completed successfully!");
}

fn run_search(query: &str, embeddings_file: &std::path::Path, top_n: usize, full: bool) {
  // Load the semantic search engine
  let mut search = match SemanticSearch::new(embeddings_file) {
    Ok(search) => search,
    Err(e) => {
      eprintln!("Error loading embeddings database: {}", e);
      eprintln!("Make sure {} exists. Run 'toak generate' first.", embeddings_file.display());
      std::process::exit(1);
    }
  };

  // Display search info
  let metadata = search.metadata();
  println!("Searching {} chunks from {} files", metadata.total_chunks, metadata.total_files);
  println!("Query: \"{}\"\n", query);

  // Perform the search
  let results = match search.search(query, top_n) {
    Ok(results) => results,
    Err(e) => {
      eprintln!("Error performing search: {}", e);
      std::process::exit(1);
    }
  };

  if results.is_empty() {
    println!("No results found.");
    return;
  }

  // Display results
  println!("Top {} results:\n", results.len());
  println!("{}", "=".repeat(80));

  for (i, result) in results.iter().enumerate() {
    println!("\n{}. {} (similarity: {:.4})", i + 1, result.file_path, result.similarity);
    println!("{}", "-".repeat(80));

    if full {
      // Show full content
      println!("{}", result.content);
    } else {
      // Show preview (first 5 lines)
      let preview: Vec<&str> = result.content.lines().take(5).collect();
      println!("{}", preview.join("\n"));

      let total_lines = result.content.lines().count();
      if total_lines > 5 {
        println!("\n... ({} more lines, use --full to see all)", total_lines - 5);
      }
    }
  }

  println!("\n{}", "=".repeat(80));
}
