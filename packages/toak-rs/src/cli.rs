use clap::Parser;
use std::path::PathBuf;

#[derive(Parser, Debug)]
#[command(name = "toak")]
#[command(about = "A CLI tool for tokenizing git repositories into markdown files", long_about = None)]
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
    pub fn verbose(&self) -> bool {
        !self.quiet
    }

    pub fn dir(&self) -> PathBuf {
        self.dir.clone().unwrap_or_else(|| PathBuf::from("."))
    }

    pub fn output_file_path(&self) -> PathBuf {
        self.output_file_path
            .clone()
            .unwrap_or_else(|| PathBuf::from("prompt.md"))
    }
}
