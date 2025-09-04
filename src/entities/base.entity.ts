import { ApiProperty } from "@nestjs/swagger";
import { BaseEntity, Column, CreateDateColumn, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";


export abstract class OBaseEntity extends BaseEntity {
    @PrimaryGeneratedColumn('increment')
    id?: number;

    @Column({ default: "admin@admin.com" })
    createdBy?: string;

    @Column({ nullable: true })
    updatedBy?: string;

    @CreateDateColumn({ type: 'timestamp' })
    createdAt?: Date;

    @UpdateDateColumn({ type: 'timestamp' })
    updatedAt?: Date;
}