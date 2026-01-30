//! Command line arguments backing the `toak` binary.
use clap::{Parser, Subcommand};
use std::path::PathBuf;

#[derive(Parser, Debug)]
#[command(
  name = "toak",
  about = "A CLI tool for tokenizing git repositories and performing semantic search",
  version
)]
pub struct Args {
  #[command(subcommand)]
  pub command: Commands,
}

#[derive(Subcommand, Debug)]
pub enum Commands {
  /// Print version information
  Version,
  /// Generate markdown documentation and embeddings database
  Generate {
    /// Project directory to process
    #[arg(long, short = 'd')]
    dir: Option<PathBuf>,

    /// Output file path for the generated markdown
    #[arg(long, short = 'o')]
    output_file_path: Option<PathBuf>,

    /// Disable verbose output
    #[arg(long)]
    quiet: bool,

    /// Preset prompt template to use
    #[arg(long, short = 'p')]
    prompt: Option<String>,
  },
  /// Search the embeddings database using semantic similarity
  Search {
    /// Query string to search for
    query: String,

    /// Path to the embeddings.json file
    #[arg(long, short = 'f', default_value = "embeddings.json")]
    embeddings_file: PathBuf,

    /// Number of top results to return
    #[arg(long, short = 'n', default_value = "5")]
    top_n: usize,

    /// Show full content of results (not just preview)
    #[arg(long)]
    full: bool,
  },
}

