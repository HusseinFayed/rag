import { ApiProperty } from '@nestjs/swagger';

export class QuestionDto {
  @ApiProperty({ description: 'The question to ask about the PDF content' })
  question: string;
}
