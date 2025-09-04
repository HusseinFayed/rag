import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Entity, Column, OneToMany, UpdateDateColumn, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';
import { OBaseEntity } from './base.entity';

@Entity()
export class AddedTeamsCount extends OBaseEntity{

    @ApiProperty()
    @Column({ nullable: false })
    addedTeamCount: number;
    
}