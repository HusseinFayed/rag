import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AskingModule } from './asking/asking.module';
import { TypeOrmModule } from '@nestjs/typeorm';

@Module({
  imports: [
     TypeOrmModule.forRoot({
      // type: 'sqlite',
      // database: 'database.sqlite',
      // entities: [join(__dirname, '**', '*.entity{.ts,.js}')], // Adjust the path to your entities
      // synchronize: true, // Set to false in production

      

      type: 'postgres',
      url:"postgres://postgres:0000@localhost:5432/matches",
      entities: ['dist/**/*.entity{.ts,.js}'],
      synchronize: true,
      autoLoadEntities: true,
      logging: false,
      logger: 'advanced-console'


    }),
    AskingModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
