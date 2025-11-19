//! Command line arguments backing the `toak` binary.
use clap::Parser;
use std::path::PathBuf;

#[derive(Parser, Debug)]
#[command(name = "toak")]
#[command(about = "A CLI tool for tokenizing git repositories into markdown files", long_about = None)]
/// CLI arguments for generating markdown/embeddings exports.
pub struct Args {
  /// Project directory to process
  #[arg(long, short = 'd')]
  pub dir: Option<PathBuf>,

  /// Output file path for the generated markdown
  #[arg(long, short = 'o')]
  pub output_file_path: Option<PathBuf>,

  /// Disable verbose output
  #[arg(long)]
  pub quiet: bool,

  /// Preset prompt template to use
  #[arg(long, short = 'p')]
  pub prompt: Option<String>,
}

impl Args {
  /// Returns true when verbose logging is requested.
  pub fn verbose(&self) -> bool {
    !self.quiet
  }

  /// Returns the target directory, defaulting to the current working directory.
  pub fn dir(&self) -> PathBuf {
    self.dir.clone().unwrap_or_else(|| PathBuf::from("."))
  }

  /// Returns the output path for markdown, defaulting to `prompt.md`.
  pub fn output_file_path(&self) -> PathBuf {
    self
      .output_file_path
      .clone()
      .unwrap_or_else(|| PathBuf::from("prompt.md"))
  }
}
