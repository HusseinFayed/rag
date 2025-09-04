import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Entity, Column, OneToMany, UpdateDateColumn, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';
// import { Favourite } from './device-team.entity';
import { Matches } from './matches.entity';
import { OBaseEntity } from './base.entity';

@Entity()
export class Teams extends OBaseEntity {
    
    @ApiProperty()
    @Column({ unique: true, nullable: false })
    name!: string;

    @ApiProperty()
    @Column({ unique: false, nullable: true })
    image?: string;

    // @OneToMany(() => Favourite, (favourite) => favourite.team)
    // favourites!: Favourite[];

    @OneToMany(() => Matches, (match) => match.homeTeam)
    homeMatches!: Matches[];

    @OneToMany(() => Matches, (match) => match.awayTeam)
    awayMatches!: Matches[];
}