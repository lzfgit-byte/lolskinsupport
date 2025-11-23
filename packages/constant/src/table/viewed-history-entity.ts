import { Column, Entity } from 'typeorm';
import { MyBaseEntity } from '@/table/my-base-entity';

// @ts-ignore
@Entity('viewed_history', { comment: '观看的历史表' })
export class ViewedHistoryEntity extends MyBaseEntity {
  // @ts-ignore
  @Column('varchar', { comment: '观看的类型' })
  type: string;

  // @ts-ignore
  @Column('varchar', { comment: 'item的url' })
  url: string;

  // @ts-ignore
  @Column('varchar', { comment: '观看的配置信息' })
  value: string;
}
