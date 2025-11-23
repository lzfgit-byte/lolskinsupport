import { Column, Entity } from 'typeorm';
import { MyBaseEntity } from '@/table/my-base-entity';

// @ts-ignore
@Entity('web-config', { comment: '网站配置表' })
export class WebConfigEntity extends MyBaseEntity {
  // @ts-ignore
  @Column('varchar', { comment: '收藏的类型' })
  key: string;

  // @ts-ignore
  @Column('varchar', { comment: '代码' })
  code: string;

  // @ts-ignore
  @Column('varchar', { comment: '代码备份', nullable: true })
  backCode: string;

  // @ts-ignore
  @Column('integer', { comment: '排序' })
  sort: number;
}
