//! Utilities that turn a repository into a human readable markdown file, handling ignore files
//! and ensuring the generated artifacts are tracked in `.gitignore`.
use crate::token_cleaner::{clean_and_redact, count_tokens};
use anyhow::{anyhow, Result};
use regex::Regex;
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::process::Command;
use tokio::fs;

/// Default file type exclusions (by extension)
/// File types that can be processed via OCR instead of reading as text
#[cfg(target_os = "macos")]
const OCR_FILE_TYPES: &[&str] = &[
  ".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp", ".tiff", ".pdf",
];

/// Default file type exclusions (by extension)
#[cfg(target_os = "macos")]
const DEFAULT_FILE_TYPE_EXCLUSIONS: &[&str] = &[
  ".svg", ".ico", ".ttf", ".woff", ".woff2", ".eot", ".otf", ".lock", ".lockb", ".exe", ".dll",
  ".so", ".dylib", ".bin", ".dat", ".pyc", ".pyo", ".class", ".jar", ".zip", ".tar", ".gz",
  ".rar", ".7z", ".mp3", ".mp4", ".avi", ".mov", ".wav", ".db", ".sqlite", ".sqlite3",
];

#[cfg(not(target_os = "macos"))]
const DEFAULT_FILE_TYPE_EXCLUSIONS: &[&str] = &[
  ".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp", ".tiff", ".pdf", ".svg", ".ico", ".ttf",
  ".woff", ".woff2", ".eot", ".otf", ".lock", ".lockb", ".exe", ".dll", ".so", ".dylib", ".bin",
  ".dat", ".pyc", ".pyo", ".class", ".jar", ".zip", ".tar", ".gz", ".rar", ".7z", ".mp3", ".mp4",
  ".avi", ".mov", ".wav", ".db", ".sqlite", ".sqlite3",
];

/// Default file pattern exclusions
const DEFAULT_FILE_EXCLUSIONS: &[&str] = &[
  "**/.*rc",
  "**/.*rc.{js,json,yaml,yml}",
  "**/*.config.{js,ts}",
  "**/tsconfig.json",
  "**/tsconfig*.json",
  "**/jsconfig.json",
  "**/jsconfig*.json",
  "**/package-lock.json",
  "**/.prettierignore",
  "**/.dockerignore",
  "**/.env*",
  "**/*.vars",
  "**/secrets.*",
  "**/.git*",
  "**/.hg*",
  "**/.svn*",
  "**/CVS",
  "**/.github/",
  "**/.gitlab-ci.yml",
  "**/azure-pipelines.yml",
  "**/jenkins*",
  "**/node_modules/",
  "**/target/",
  "**/__pycache__/",
  "**/venv/",
  "**/.venv/",
  "**/env/",
  "**/build/",
  "**/dist/",
  "**/out/",
  "**/bin/",
  "**/obj/",
  "**/README*",
  "**/CHANGELOG*",
  "**/CONTRIBUTING*",
  "**/LICENSE*",
  "**/docs/",
  "**/documentation/",
  "**/.idea/",
  "**/.vscode/",
  "**/.eclipse/",
  "**/.settings/",
  "**/.zed/",
  "**/.cursor/",
  "**/.project",
  "**/.classpath",
  "**/.factorypath",
  "**/test{s,}/",
  "**/spec/",
  "**/fixtures/",
  "**/testdata/",
  "**/__tests__/",
  "**/*.{test,spec}.*",
  "**/coverage/",
  "**/jest.config.*",
  "**/logs/",
  "**/tmp/",
  "**/temp/",
  "**/*.log",
];

/// Configuration that controls how markdown is generated.
pub struct MarkdownGeneratorOptions {
  pub dir: PathBuf,
  pub output_file_path: PathBuf,
  pub file_type_exclusions: HashSet<String>,
  pub file_exclusions: Vec<String>,
  pub verbose: bool,
}

impl Default for MarkdownGeneratorOptions {
  fn default() -> Self {
    Self {
      dir: PathBuf::from("."),
      output_file_path: PathBuf::from("prompt.md"),
      file_type_exclusions: DEFAULT_FILE_TYPE_EXCLUSIONS
        .iter()
        .map(|s| s.to_string())
        .collect(),
      file_exclusions: DEFAULT_FILE_EXCLUSIONS
        .iter()
        .map(|s| s.to_string())
        .collect(),
      verbose: true,
    }
  }
}

/// Drives the markdown generation run by walking tracked files, cleaning artifacts, and aggregating text.
pub struct MarkdownGenerator {
  options: MarkdownGeneratorOptions,
  file_exclusions: Vec<String>,
  initialized: bool,
}

impl MarkdownGenerator {
  pub fn new(options: MarkdownGeneratorOptions) -> Self {
    Self {
      file_exclusions: options.file_exclusions.clone(),
      options,
      initialized: false,
    }
  }

  /// Loads nested .aiignore files and updates the exclusion patterns
  async fn load_nested_ignore_files(&mut self) -> Result<()> {
    if self.options.verbose {
      println!("Loading ignore patterns...");
    }

    // Find all .aiignore files
    let mut ignore_files = Vec::new();
    self.find_ignore_files(&self.options.dir, &mut ignore_files)?;

    if self.options.verbose {
      println!("Found {} ignore files", ignore_files.len());
    }

    // Process each ignore file
    for ignore_file in ignore_files {
      if let Ok(content) = fs::read_to_string(&ignore_file).await {
        let patterns: Vec<String> = content
          .lines()
          .map(|line| line.trim())
          .filter(|line| !line.is_empty() && !line.starts_with('#'))
          .map(|s| s.to_string())
          .collect();

        // Get relative patterns based on ignore file location
        if let Ok(ignore_dir) = ignore_file
          .parent()
          .unwrap_or_else(|| Path::new("."))
          .to_path_buf()
          .strip_prefix(&self.options.dir)
        {
          for pattern in patterns {
            let relative_pattern = if !pattern.starts_with('/') && !pattern.starts_with("**") {
              format!("{}/{}", ignore_dir.display(), pattern)
            } else {
              pattern
            };
            self.file_exclusions.push(relative_pattern);
          }
        }
      }
    }

    // Remove duplicates
    self.file_exclusions.sort();
    self.file_exclusions.dedup();

    if self.options.verbose {
      println!("Total exclusion patterns: {}", self.file_exclusions.len());
    }

    Ok(())
  }

  fn find_ignore_files(&self, dir: &Path, results: &mut Vec<PathBuf>) -> Result<()> {
    use walkdir::WalkDir;

    for entry in WalkDir::new(dir).into_iter().filter_map(|e| e.ok()) {
      if entry.file_name() == ".aiignore" {
        results.push(entry.path().to_path_buf());
      }
    }
    Ok(())
  }

  /// Initializes the generator by loading ignore files
  async fn initialize(&mut self) -> Result<()> {
    if !self.initialized {
      self.load_nested_ignore_files().await?;
      self.initialized = true;
    }
    Ok(())
  }

  /// Gets tracked files from git, applying exclusions
  async fn get_tracked_files(&mut self) -> Result<Vec<String>> {
    self.initialize().await?;

    // Run git ls-files
    let output = Command::new("git")
      .arg("ls-files")
      .current_dir(&self.options.dir)
      .output()
      .map_err(|e| anyhow!("Failed to execute git ls-files: {}", e))?;

    if !output.status.success() {
      return Err(anyhow!("git ls-files failed"));
    }

    let output_str = String::from_utf8(output.stdout)
      .map_err(|e| anyhow!("Failed to decode git output: {}", e))?;

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
        "Files to process after exclusions: {}",
        filtered_files.len()
      );
    }

    Ok(filtered_files)
  }

  /// Checks if a file path matches any exclusion patterns
  fn matches_exclusion_patterns(&self, file: &str) -> bool {
    for pattern in &self.file_exclusions {
      if self.glob_match(pattern, file) {
        return true;
      }
    }
    false
  }

  /// Simple glob pattern matching
  fn glob_match(&self, pattern: &str, path: &str) -> bool {
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

  /// Checks if a file extension is an OCR-able type
  #[cfg(target_os = "macos")]
  fn is_ocr_file(ext: &str) -> bool {
    OCR_FILE_TYPES.contains(&ext)
  }

  /// Reads and processes file content, using OCR for supported image/PDF types on macOS
  async fn read_file_content(&self, file_path: &Path) -> Result<String> {
    #[cfg(target_os = "macos")]
    {
      let ext = file_path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| format!(".{}", e.to_lowercase()))
        .unwrap_or_default();

      if Self::is_ocr_file(&ext) {
        return self.read_file_content_ocr(file_path).await;
      }
    }

    let content = fs::read_to_string(file_path).await?;
    let cleaned = clean_and_redact(&content);

    if self.options.verbose && !cleaned.is_empty() {
      let token_count = count_tokens(&cleaned);
      println!("{}: Tokens[{}]", file_path.display(), token_count);
    }

    Ok(cleaned.trim_end().to_string())
  }

  /// Reads file content via OCR (macOS only)
  #[cfg(target_os = "macos")]
  async fn read_file_content_ocr(&self, file_path: &Path) -> Result<String> {
    use toak_ocr::{AppleOcrEngine, OcrEngine, OcrInput};

    let engine = AppleOcrEngine::new();
    let input = OcrInput::FilePath(file_path.to_path_buf());
    let output = engine
      .recognize(&input)
      .await
      .map_err(|e| anyhow!("OCR failed for {}: {}", file_path.display(), e))?;

    if self.options.verbose && !output.text.is_empty() {
      let token_count = count_tokens(&output.text);
      println!("{}: Tokens[{}] (OCR)", file_path.display(), token_count);
    }

    Ok(output.text.trim_end().to_string())
  }

  /// Generates markdown from all tracked files
  async fn generate_markdown(&mut self) -> Result<String> {
    let tracked_files = self.get_tracked_files().await?;

    if self.options.verbose {
      println!("Generating markdown for {} files", tracked_files.len());
    }

    let mut markdown = String::from("# Project Files\n\n");

    for file in tracked_files {
      let absolute_path = self.options.dir.join(&file);
      match self.read_file_content(&absolute_path).await {
        Ok(content) => {
          if !content.trim().is_empty() {
            markdown.push_str(&format!("## {}\n~~~\n{}\n~~~\n\n", file, content.trim()));
          } else if self.options.verbose {
            println!("Skipping {} as it has no content after cleaning.", file);
          }
        }
        Err(e) => {
          if self.options.verbose {
            eprintln!("Error reading file {}: {}", file, e);
          }
        }
      }
    }

    Ok(markdown)
  }

  /// Reads the todo file, creating it if it doesn't exist
  async fn get_todo(&self) -> Result<String> {
    let todo_path = self.options.dir.join("todo");

    if self.options.verbose {
      println!("Reading todo file");
    }

    match fs::read_to_string(&todo_path).await {
      Ok(content) => Ok(content),
      Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
        if self.options.verbose {
          println!("File not found, creating a new 'todo' file.");
        }
        fs::write(&todo_path, "").await?;
        Ok(String::new())
      }
      Err(e) => Err(anyhow!("Error reading todo file: {}", e)),
    }
  }

  /// Gets or creates the root .aiignore file, ensuring prompt.md is included
  async fn get_root_ignore(&self) -> Result<String> {
    let ignore_path = self.options.dir.join(".aiignore");

    match fs::read_to_string(&ignore_path).await {
      Ok(content) => {
        // Ensure prompt.md is in the .aiignore file
        let lines: Vec<&str> = content.lines().map(|l| l.trim()).collect();
        if !lines.contains(&"prompt.md") {
          let mut new_content = content.clone();
          if !new_content.is_empty() && !new_content.ends_with('\n') {
            new_content.push('\n');
          }
          new_content.push_str("prompt.md\n");
          fs::write(&ignore_path, &new_content).await?;
          return Ok(new_content);
        }
        Ok(content)
      }
      Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
        if self.options.verbose {
          println!("File not found, creating a root '.aiignore' file.");
        }
        fs::write(&ignore_path, "todo\nprompt.md\nembeddings.json").await?;
        Ok(String::from("todo\nprompt.md\nembeddings.json"))
      }
      Err(e) => Err(anyhow!("Error reading .aiignore: {}", e)),
    }
  }

  /// Updates .gitignore to include prompt.md, todo, and embeddings.json
  async fn update_gitignore(&self) -> Result<()> {
    let gitignore_path = self.options.dir.join(".gitignore");

    let content = match fs::read_to_string(&gitignore_path).await {
      Ok(c) => c,
      Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
        if self.options.verbose {
          println!("File not found, creating a '.gitignore' file.");
        }
        String::new()
      }
      Err(e) => return Err(anyhow!("Error reading .gitignore: {}", e)),
    };

    let lines: Vec<&str> = content.lines().map(|l| l.trim()).collect();
    let needs_prompt_md = !lines.contains(&"prompt.md");
    let needs_todo = !lines.contains(&"todo");
    let needs_embeddings_json = !lines.contains(&"embeddings.json");

    if needs_prompt_md || needs_todo || needs_embeddings_json {
      if self.options.verbose {
        println!("Updating .gitignore with generated files");
      }

      let mut new_content = content;
      if !new_content.is_empty() && !new_content.ends_with('\n') {
        new_content.push('\n');
      }

      if needs_prompt_md {
        new_content.push_str("prompt.md\n");
      }
      if needs_todo {
        new_content.push_str("todo\n");
      }
      if needs_embeddings_json {
        new_content.push_str("embeddings.json\n");
      }

      fs::write(&gitignore_path, new_content).await?;
    }

    Ok(())
  }

  /// Creates the complete markdown document that combines code snippets with todo notes.
  pub async fn create_markdown_document(&mut self) -> Result<MarkdownResult> {
    let code_markdown = self.generate_markdown().await?;
    let todos = self.get_todo().await?;
    let _ = self.get_root_ignore().await?;
    self.update_gitignore().await?;

    let markdown = format!("{}\n---\n\n{}\n", code_markdown, todos);
    let token_count = count_tokens(&markdown);

    if self.options.verbose {
      println!(
        "Markdown document created at {}",
        self.options.output_file_path.display()
      );
      println!("{{ \"total_tokens\": {} }}", token_count);
    }

    fs::write(&self.options.output_file_path, &markdown).await?;

    Ok(MarkdownResult {
      success: true,
      token_count: Some(token_count),
      error: None,
    })
  }
}

/// Result returned after a markdown generation run.
#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct MarkdownResult {
  pub success: bool,
  pub token_count: Option<usize>,
  pub error: Option<String>,
}
