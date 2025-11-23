import { BaseEntity, Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

export class MyBaseEntity extends BaseEntity {
  constructor() {
    super();
    this.createTime = new Date();
  }

  // @ts-ignore
  @PrimaryGeneratedColumn('uuid')
  id: number;

  // @ts-ignore
  @Column('datetime')
  createTime: any;
}
