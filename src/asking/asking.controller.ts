import {
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
  Body,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Express } from 'express'; // ✅ this is required
import * as fs from 'fs';
import { AskService } from './asking.service';
import { QuestionDto } from './question.dto';


@ApiTags('Ask PDF')
@Controller('ask')
export class AskController {
  constructor(private readonly askService: AskService) {}

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


}
