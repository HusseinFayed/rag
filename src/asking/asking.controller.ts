import {
  Controller,
  Post,
  Body,
  UploadedFile,
  UseInterceptors,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import * as fs from 'fs';

import { DatabaseQueryService } from './database.service';
import { AskService } from './asking.service';

export class QuestionDto {
  question: string;
}

export class DatabaseQuestionDto {
  question: string;
  includeContext?: boolean = false;
}

@ApiTags('Ask')
@Controller('ask')
export class AskController {
  constructor(
    private readonly askService: AskService,
    private readonly databaseQueryService: DatabaseQueryService,
  ) {}

  @Post('askingMyServer')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Ask a question based on a PDF file (offline)' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
        question: {
          type: 'string',
          example: 'What is the main topic of this PDF?',
        },
      },
      required: ['file', 'question'],
    },
  })
  @ApiResponse({ status: 200, description: 'Answer to the question based on the PDF content' })
  @ApiResponse({ status: 400, description: 'Invalid file or question' })
  async askQuestion(
    @UploadedFile() file: Express.Multer.File,
    @Body() questionDto: QuestionDto,
  ): Promise<{ answer: string }> {
    if (!file || !file.buffer || !questionDto.question) {
      throw new HttpException('Missing file or question', HttpStatus.BAD_REQUEST);
    }

    // save buffer as temp file
    const tempPath = `/tmp/${Date.now()}-${file.originalname}`;
    fs.writeFileSync(tempPath, file.buffer);

    try {
      const answer = await this.askService.askFromPdf(tempPath, questionDto.question);
      return { answer };
    } finally {
      // cleanup temp file
      fs.unlinkSync(tempPath);
    }
  }

  @Post('askDatabase')
  @ApiOperation({ 
    summary: 'Ask a question about teams and matches using AI and database query',
    description: 'Query the database for teams and matches information and get an AI-powered response'
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        question: {
          type: 'string',
          example: 'How many teams are in the database?',
          description: 'Question about teams, matches, or competitions'
        },
        includeContext: {
          type: 'boolean',
          example: false,
          description: 'Whether to include the database context in the response',
          default: false
        }
      },
      required: ['question'],
    },
  })
  @ApiResponse({ 
    status: 200, 
    description: 'AI-powered answer based on database content',
    schema: {
      type: 'object',
      properties: {
        answer: {
          type: 'string',
          description: 'AI-generated answer based on database query results'
        },
        context: {
          type: 'string',
          description: 'Database context used for generating the answer (only if includeContext is true)'
        }
      }
    }
  })
  @ApiResponse({ status: 400, description: 'Invalid question' })
  @ApiResponse({ status: 500, description: 'Database query or AI processing failed' })
  async askDatabase(
    @Body() databaseQuestionDto: DatabaseQuestionDto,
  ): Promise<{ answer: string; context?: string }> {
    if (!databaseQuestionDto.question || databaseQuestionDto.question.trim().length === 0) {
      throw new HttpException('Question is required and cannot be empty', HttpStatus.BAD_REQUEST);
    }

    try {
      const result = await this.databaseQueryService.queryDatabaseWithAI(
        databaseQuestionDto.question,
        databaseQuestionDto.includeContext || false
      );
      
      return result;
    } catch (error) {
      throw new HttpException(
        `Failed to process database query: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('checkOllama')
  @ApiOperation({ summary: 'Check Ollama availability and list available models' })
  @ApiResponse({ 
    status: 200, 
    description: 'Ollama status and available models',
    schema: {
      type: 'object',
      properties: {
        available: { type: 'boolean' },
        models: { 
          type: 'array',
          items: { type: 'string' }
        }
      }
    }
  })
  async checkOllamaStatus(): Promise<{ available: boolean; models: string[] }> {
    try {
      return await this.databaseQueryService.checkOllamaAvailability();
    } catch (error) {
      throw new HttpException(
        `Failed to check Ollama status: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}