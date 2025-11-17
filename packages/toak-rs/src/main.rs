mod cli;
mod markdown_generator;
mod token_cleaner;

use clap::Parser;
use cli::Args;
use markdown_generator::{MarkdownGenerator, MarkdownGeneratorOptions};

#[tokio::main]
async fn main() {
  println!("RUNNING TOKENIZER");

  let args = Args::parse();

  let options = MarkdownGeneratorOptions {
    dir: args.dir(),
    output_file_path: args.output_file_path(),
    file_type_exclusions: Default::default(),
    file_exclusions: Default::default(),
    verbose: args.verbose(),
  };

  let mut generator = MarkdownGenerator::new(options);

  match generator.create_markdown_document().await {
    Ok(result) => {
      if !result.success {
        std::process::exit(1);
      }
    }
    Err(e) => {
      eprintln!("Error: {}", e);
      std::process::exit(1);
    }
  }
}
