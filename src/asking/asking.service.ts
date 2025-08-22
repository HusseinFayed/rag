import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as math from 'mathjs';
import * as pdfParse from 'pdf-parse';  // ✅ fixed import

@Injectable()
export class AskService {
  private readonly logger = new Logger(AskService.name);

  // Use request-specific storage to handle multiple concurrent requests
  private memoryStores: Map<string, { text: string; embedding: number[] }[]> = new Map();

  // 1. Extract text from PDF with better error handling
  private async extractTextFromPdf(filePath: string): Promise<string> {
    try {
      if (!fs.existsSync(filePath)) {
        throw new Error('PDF file not found');
      }

      const buffer = fs.readFileSync(filePath);
      const data = await pdfParse(buffer);

      if (!data.text || data.text.trim().length === 0) {
        throw new Error('No text found in PDF');
      }

      this.logger.log(`Extracted ${data.text.length} characters from PDF`);
      return data.text;
    } catch (error) {
      this.logger.error(`PDF extraction failed: ${error.message}`);
      throw new Error(`Failed to extract text from PDF: ${error.message}`);
    }
  }

  // 2. Improved text chunking with overlap
  private splitTextIntoChunks(text: string, chunkSize = 500, overlap = 50): string[] {
    const sentences = text.split(/(?<=[.!?])\s+/);
    const chunks: string[] = [];
    let current = '';

    for (const sentence of sentences) {
      if ((current + sentence).length > chunkSize && current.trim()) {
        chunks.push(current.trim());
        // Add overlap by keeping last few words
        const words = current.trim().split(' ');
        current = words.slice(-overlap / 10).join(' ') + ' ';
      }
      current += sentence + ' ';
    }

    if (current.trim()) {
      chunks.push(current.trim());
    }

    this.logger.log(`Split text into ${chunks.length} chunks`);
    return chunks.filter(chunk => chunk.length > 10); // Remove very small chunks
  }

  // 3. Fixed Ollama embedding with proper error handling
  private async getEmbeddingsOllama(texts: string[]): Promise<number[][]> {
    const embeddings: number[][] = [];

    this.logger.log(`Generating embeddings for ${texts.length} chunks`);

    for (let i = 0; i < texts.length; i++) {
      try {
        const result = await this.runOllamaEmbedding(texts[i]);
        embeddings.push(result);

        // Log progress for large documents
        if ((i + 1) % 10 === 0) {
          this.logger.log(`Generated ${i + 1}/${texts.length} embeddings`);
        }
      } catch (error) {
        this.logger.error(`Failed to generate embedding for chunk ${i}: ${error.message}`);
        throw error;
      }
    }

    return embeddings;
  }

  private async runOllamaEmbedding(text: string): Promise<number[]> {
    try {
      // Use Ollama HTTP API instead of CLI
      const response = await fetch('http://localhost:11434/api/embeddings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'nomic-embed-text',
          prompt: text,
        }),
      });

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      if (!data.embedding || !Array.isArray(data.embedding)) {
        throw new Error('Invalid embedding response from Ollama');
      }

      return data.embedding;
    } catch (error) {
      if (error.code === 'ECONNREFUSED') {
        throw new Error('Cannot connect to Ollama. Make sure Ollama is running on http://localhost:11434');
      }
      throw new Error(`Ollama embedding failed: ${error.message}`);
    }
  }

  // 4. Store embeddings with request ID
  private async storeEmbeddingsInMemory(
    embeddings: number[][],
    texts: string[],
    requestId: string
  ) {
    this.memoryStores.set(requestId, texts.map((t, i) => ({
      text: t,
      embedding: embeddings[i],
    })));

    this.logger.log(`Stored ${texts.length} embeddings for request ${requestId}`);
  }

  // 5. Enhanced cosine similarity with validation
  private cosineSimilarity(a: number[], b: number[]): number {
    if (!a || !b || a.length !== b.length) {
      throw new Error('Invalid vectors for similarity calculation');
    }

    try {
      const dot = math.dot(a, b) as number;
      const normA = math.norm(a) as number;
      const normB = math.norm(b) as number;

      if (normA === 0 || normB === 0) return 0;

      return dot / (normA * normB);
    } catch (error) {
      this.logger.error(`Cosine similarity calculation failed: ${error.message}`);
      return 0;
    }
  }

  // 6. Enhanced search with configurable top K
  private async searchRelevantChunks(
    questionEmbedding: number[],
    requestId: string,
    topK = 3
  ): Promise<{ text: string; score: number }[]> {
    const store = this.memoryStores.get(requestId);
    if (!store) {
      throw new Error('No embeddings found for this request');
    }

    const ranked = store
      .map((item) => ({
        text: item.text,
        score: this.cosineSimilarity(questionEmbedding, item.embedding),
      }))
      .sort((a, b) => b.score - a.score);

    const topChunks = ranked.slice(0, topK);
    this.logger.log(`Found ${topChunks.length} relevant chunks with scores: ${topChunks.map(c => c.score.toFixed(3)).join(', ')}`);

    return topChunks;
  }

  // 7. Enhanced Ollama LLM interaction using HTTP API
  private async askOllama(question: string, context: string): Promise<string> {
    try {
      const prompt = `You are a helpful assistant that answers questions based on provided context.

Context:
${context}

Question: ${question}

Instructions:
- Answer only based on the provided context
- If the context doesn't contain relevant information, say "I cannot find relevant information in the provided context to answer this question."
- Be concise and accurate
- Cite specific parts of the context when possible

Answer:`;

      // Use installed models (from /api/tags)
      const modelNames = ['gemma3:1b'];

      let lastError: Error;

      for (const modelName of modelNames) {
        try {
          this.logger.log(`Trying model: ${modelName}`);

          const response = await fetch('http://localhost:11434/api/generate', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: modelName,
              prompt: prompt,
              stream: false,
            }),
          });

          if (response.ok) {
            const data = await response.json();

            if (data.response) {
              this.logger.log(`Successfully used model: ${modelName}`);
              return data.response.trim();
            }
          }

          this.logger.warn(`Model ${modelName} failed with status: ${response.status}`);
          lastError = new Error(`Model ${modelName} returned ${response.status}`);

        } catch (error) {
          this.logger.warn(`Model ${modelName} failed: ${error.message}`);
          lastError = error;
          continue;
        }
      }

      throw new Error(`All models failed. Last error: ${lastError?.message}. Available models: gemma3:1b`);

    } catch (error) {
      if ((error as any).code === 'ECONNREFUSED') {
        throw new Error('Cannot connect to Ollama. Make sure Ollama is running on http://localhost:11434');
      }
      throw new Error(`Ollama LLM failed: ${error.message}`);
    }
  }


  // 8. Enhanced full pipeline with request tracking
  async askFromPdf(pdfPath: string, question: string): Promise<string> {
    const requestId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.logger.log(`Starting PDF question answering for request ${requestId}`);

    try {
      // Step 1: Extract text
      this.logger.log('Step 1: Extracting text from PDF...');
      const text = await this.extractTextFromPdf(pdfPath);

      // Step 2: Split into chunks
      this.logger.log('Step 2: Splitting text into chunks...');
      const chunks = this.splitTextIntoChunks(text);

      if (chunks.length === 0) {
        throw new Error('No valid text chunks found in PDF');
      }

      // Step 3: Get embeddings for chunks
      this.logger.log('Step 3: Generating embeddings for chunks...');
      const embeddings = await this.getEmbeddingsOllama(chunks);

      // Step 4: Store in memory
      this.logger.log('Step 4: Storing embeddings...');
      await this.storeEmbeddingsInMemory(embeddings, chunks, requestId);

      // Step 5: Embed the question
      this.logger.log('Step 5: Generating question embedding...');
      const qEmbedding = await this.getEmbeddingsOllama([question]);

      // Step 6: Find top chunks
      this.logger.log('Step 6: Finding relevant chunks...');
      const relevantChunks = await this.searchRelevantChunks(qEmbedding[0], requestId, 3);

      if (relevantChunks.length === 0 || relevantChunks[0].score < 0.1) {
        this.logger.warn('No relevant chunks found with sufficient similarity');
        return "I cannot find relevant information in the provided PDF to answer this question.";
      }

      // Step 7: Ask LLM with context
      this.logger.log('Step 7: Generating answer...');
      const context = relevantChunks.map(chunk => chunk.text).join('\n\n');
      const answer = await this.askOllama(question, context);

      this.logger.log(`Successfully completed request ${requestId}`);
      return answer;

    } catch (error) {
      this.logger.error(`Request ${requestId} failed: ${error.message}`);
      throw error;
    } finally {
      // Cleanup memory store for this request
      this.memoryStores.delete(requestId);
      this.logger.log(`Cleaned up memory for request ${requestId}`);
    }
  }

  // Utility method to check Ollama availability and list models
  async checkOllamaAvailability(): Promise<{ available: boolean; models: string[] }> {
    try {
      const response = await fetch('http://localhost:11434/api/tags', {
        method: 'GET',
        signal: AbortSignal.timeout(5000), // 5 second timeout
      });

      if (response.ok) {
        const data = await response.json();
        const models = data.models ? data.models.map((m: any) => m.name) : [];
        this.logger.log(`Available Ollama models: ${models.join(', ')}`);
        return { available: true, models };
      }

      return { available: false, models: [] };
    } catch (error) {
      this.logger.error(`Ollama availability check failed: ${error.message}`);
      return { available: false, models: [] };
    }
  }

  // Method to get available models
  async getAvailableModels(): Promise<string[]> {
    const { models } = await this.checkOllamaAvailability();
    return models;
  }
}