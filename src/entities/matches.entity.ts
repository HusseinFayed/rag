import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Entity, Column, OneToMany, UpdateDateColumn, PrimaryGeneratedColumn, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Teams } from './teams.entity';
import { OBaseEntity } from './base.entity';

@Entity()
export class Matches extends OBaseEntity{

    @ApiProperty()
    @Column({ unique: false, nullable: false })
    homeTeamName?: string;

    @ApiProperty()
    @Column({ unique: false, nullable: false })
    awayTeamName?: string;

    @ApiProperty()
    @Column({ unique: false, nullable: false })
    homeTeamImage?: string;

    @ApiProperty()
    @Column({ unique: false, nullable: false })
    awayTeamImage?: string;

    @ApiProperty()
    @Column({ unique: false, nullable: true })
    competitionName?: string;

    @ApiProperty()
    @Column({ unique: false, nullable: true })
    matchTime?: string;

    @ApiProperty()
    @Column({ unique: false, nullable: true })
    competitionLink?: string;

    @ApiProperty()
    @Column({ unique: false, nullable: true })
    matchLink?: string;

    @ManyToOne(() => Teams, (team) => team.homeMatches, { nullable: true })
    @JoinColumn({ name: "homeTeamId" })
    homeTeam!: Teams;

    @ManyToOne(() => Teams, (team) => team.awayMatches, { nullable: true })
    @JoinColumn({ name: "awayTeamId" })
    awayTeam!: Teams;

    @Column({ nullable: true })
    homeTeamId!: number;

    @Column({ nullable: true })
    awayTeamId!: number;
}