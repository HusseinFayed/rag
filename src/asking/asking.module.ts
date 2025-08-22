import { Module } from "@nestjs/common";
import { AskController } from "./asking.controller";
import { AskService } from "./asking.service";


@Module({
  controllers: [AskController],
  providers: [AskService],
})
export class AskingModule {}
