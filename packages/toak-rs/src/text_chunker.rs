use crate::token_cleaner::count_tokens;

/// Configuration for text chunking
#[derive(Clone)]
pub struct ChunkerConfig {
    /// Target size for each chunk in tokens
    pub chunk_size: usize,
    /// Number of tokens to overlap between chunks for context preservation
    pub overlap_size: usize,
}

impl Default for ChunkerConfig {
    fn default() -> Self {
        Self {
            chunk_size: 800,
            overlap_size: 100,
        }
    }
}

/// Represents a chunk of text with metadata
#[derive(Debug, Clone)]
pub struct TextChunk {
    pub content: String,
    pub start_index: usize,
    pub end_index: usize,
    pub chunk_index: usize,
}

/// Chunks text into overlapping segments based on token count
pub fn chunk_text(text: &str, config: &ChunkerConfig) -> Vec<TextChunk> {
    if text.trim().is_empty() {
        return vec![];
    }

    // If the entire text fits in one chunk, return it as-is
    let total_tokens = count_tokens(text);
    if total_tokens <= config.chunk_size {
        return vec![TextChunk {
            content: text.to_string(),
            start_index: 0,
            end_index: text.len(),
            chunk_index: 0,
        }];
    }

    let mut chunks = Vec::new();
    let lines: Vec<&str> = text.lines().collect();
    let mut current_chunk = String::new();
    let mut current_tokens = 0;
    let mut start_line = 0;
    let mut chunk_index = 0;
    let mut overlap_buffer = String::new();

    for (line_idx, line) in lines.iter().enumerate() {
        let line_with_newline = format!("{}\n", line);
        let line_tokens = count_tokens(&line_with_newline);

        // If a single line is too large, we need to split it by characters
        if line_tokens > config.chunk_size {
            // First, finish current chunk if it has content
            if !current_chunk.is_empty() {
                chunks.push(TextChunk {
                    content: current_chunk.clone(),
                    start_index: start_line,
                    end_index: line_idx,
                    chunk_index,
                });
                chunk_index += 1;
            }

            // Split the large line into character-based chunks
            let char_chunks = split_large_line(line, config);
            for char_chunk in char_chunks {
                chunks.push(TextChunk {
                    content: char_chunk,
                    start_index: line_idx,
                    end_index: line_idx + 1,
                    chunk_index,
                });
                chunk_index += 1;
            }

            // Reset for next chunk
            current_chunk.clear();
            current_tokens = 0;
            start_line = line_idx + 1;
            overlap_buffer.clear();
            continue;
        }

        // Check if adding this line would exceed chunk size
        if current_tokens + line_tokens > config.chunk_size && !current_chunk.is_empty() {
            // Save current chunk
            chunks.push(TextChunk {
                content: current_chunk.clone(),
                start_index: start_line,
                end_index: line_idx,
                chunk_index,
            });
            chunk_index += 1;

            // Start new chunk with overlap from previous chunk
            current_chunk = overlap_buffer.clone();
            current_tokens = count_tokens(&current_chunk);
            start_line = line_idx;
        }

        // Add line to current chunk
        current_chunk.push_str(&line_with_newline);
        current_tokens += line_tokens;

        // Update overlap buffer (keep last N tokens worth of lines)
        overlap_buffer.push_str(&line_with_newline);
        let overlap_tokens = count_tokens(&overlap_buffer);

        // Trim overlap buffer if it's too large
        if overlap_tokens > config.overlap_size {
            let overlap_lines: Vec<&str> = overlap_buffer.lines().collect();
            let mut new_overlap = String::new();
            let mut overlap_tok = 0;

            for ol in overlap_lines.iter().rev() {
                let ol_with_newline = format!("{}\n", ol);
                let ol_tokens = count_tokens(&ol_with_newline);

                if overlap_tok + ol_tokens > config.overlap_size {
                    break;
                }

                new_overlap = format!("{}{}", ol_with_newline, new_overlap);
                overlap_tok += ol_tokens;
            }

            overlap_buffer = new_overlap;
        }
    }

    // Add final chunk if there's remaining content
    if !current_chunk.is_empty() {
        chunks.push(TextChunk {
            content: current_chunk,
            start_index: start_line,
            end_index: lines.len(),
            chunk_index,
        });
    }

    chunks
}

/// Splits a very large line into smaller chunks based on character count
fn split_large_line(line: &str, config: &ChunkerConfig) -> Vec<String> {
    let mut result = Vec::new();
    let chars: Vec<char> = line.chars().collect();

    // Estimate characters per chunk (rough approximation: 4 chars per token)
    let chars_per_chunk = config.chunk_size * 4;

    let mut start = 0;
    while start < chars.len() {
        let end = (start + chars_per_chunk).min(chars.len());
        let chunk: String = chars[start..end].iter().collect();

        // Verify the chunk isn't too large
        if count_tokens(&chunk) <= config.chunk_size || result.is_empty() {
            result.push(chunk);
            start = end;
        } else {
            // If still too large, try with fewer characters
            let reduced_end = start + (chars_per_chunk / 2).max(1);
            let chunk: String = chars[start..reduced_end].iter().collect();
            result.push(chunk);
            start = reduced_end;
        }
    }

    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_empty_text() {
        let config = ChunkerConfig::default();
        let chunks = chunk_text("", &config);
        assert_eq!(chunks.len(), 0);
    }

    #[test]
    fn test_small_text() {
        let config = ChunkerConfig::default();
        let text = "Hello, world!";
        let chunks = chunk_text(text, &config);
        assert_eq!(chunks.len(), 1);
        assert_eq!(chunks[0].content, text);
    }

    #[test]
    fn test_chunking_with_overlap() {
        let config = ChunkerConfig {
            chunk_size: 50,
            overlap_size: 10,
        };
        let text = (0..100).map(|i| format!("Line {}", i)).collect::<Vec<_>>().join("\n");
        let chunks = chunk_text(&text, &config);

        // Should create multiple chunks
        assert!(chunks.len() > 1);

        // Verify chunk indices are sequential
        for (i, chunk) in chunks.iter().enumerate() {
            assert_eq!(chunk.chunk_index, i);
        }
    }
}
