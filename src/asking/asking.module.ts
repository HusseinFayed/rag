import { Module } from "@nestjs/common";
import { AskController } from "./asking.controller";
import { AskService } from "./asking.service";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Teams } from "../entities/teams.entity";
import { AddedTeamsCount } from "../entities/addTeamsCount.entity";
import { Matches } from "../entities/matches.entity";
import { DatabaseQueryService } from "./database.service";


@Module({
  imports: [TypeOrmModule.forFeature([
    Teams, AddedTeamsCount, Matches
  ])],
  controllers: [AskController],
  providers: [AskService, DatabaseQueryService],
})
export class AskingModule { }
