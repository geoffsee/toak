mod cli;
mod markdown_generator;
mod token_cleaner;
mod embeddings_generator;
mod text_chunker;
mod json_database_generator;

use clap::Parser;
use cli::Args;
use markdown_generator::{MarkdownGenerator, MarkdownGeneratorOptions};
use json_database_generator::{JsonDatabaseGenerator, JsonDatabaseOptions};

#[tokio::main]
async fn main() {
  println!("RUNNING TOKENIZER");

  let args = Args::parse();

  // Generate markdown document
  let markdown_options = MarkdownGeneratorOptions {
    dir: args.dir(),
    output_file_path: args.output_file_path(),
    file_type_exclusions: Default::default(),
    file_exclusions: Default::default(),
    verbose: args.verbose(),
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

  let embeddings_output_path = args.dir().join("embeddings.json");
  let json_options = JsonDatabaseOptions {
    dir: args.dir(),
    output_file_path: embeddings_output_path,
    file_type_exclusions: Default::default(),
    file_exclusions: Default::default(),
    verbose: args.verbose(),
    chunker_config: Default::default(),
    max_concurrent_files: 4, // Process up to 4 files concurrently
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
