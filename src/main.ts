import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const options = new DocumentBuilder()
    .setTitle('RAG')
    .setDescription('This is a new version of RAG')
    .setVersion('1.0')
    .addSecurity('bearer', {
      type: 'http',
      scheme: 'bearer',
    })
    .build();

  const document = SwaggerModule.createDocument(app, options);
  SwaggerModule.setup('api', app, document)

  const PORT = process.env.PORT || 5500;

  await app.listen(PORT, '0.0.0.0', () => {
    Logger.log(`Eccomerce server started at ${PORT}`, 'server');
    Logger.log(`DB connected on ${process.env.DB_HOST}`, 'DataBase')
    Logger.log(`http://localhost:${PORT}/api`, "swagger")
  });
}


bootstrap();
