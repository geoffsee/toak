use anyhow::Result;
use toak_rs::prelude::*;

fn main() -> Result<()> {
    // Load the embeddings database
    let mut search = SemanticSearch::new("embeddings.json")?;

    // Display database metadata
    let metadata = search.metadata();
    println!("Embeddings Database Information:");
    println!("  Model: {}", metadata.model);
    println!("  Total chunks: {}", metadata.total_chunks);
    println!("  Total files: {}", metadata.total_files);
    println!("  Chunk size: {}", metadata.chunk_size);
    println!("  Overlap size: {}", metadata.overlap_size);
    println!();

    // Define search queries
    let queries = vec![
        ("rust code", 3),
        ("configuration files", 2),
        ("gitignore", 2),
    ];

    // Perform searches
    for (query, top_n) in queries {
        println!("Search query: '{}'", query);
        println!("Top {} results:", top_n);
        println!("{}", "=".repeat(60));

        let results = search.search(query, top_n)?;

        for (i, result) in results.iter().enumerate() {
            println!("{}. {} (similarity: {:.4})", i + 1, result.file_path, result.similarity);

            // Display a preview of the content
            let preview = result.content
                .lines()
                .take(3)
                .collect::<Vec<_>>()
                .join("\n   ");

            if !preview.is_empty() {
                println!("   {}", preview);
            }
            println!();
        }
        println!();
    }

    Ok(())
}