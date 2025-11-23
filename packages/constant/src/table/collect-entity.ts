import { Column, Entity } from 'typeorm';
import { MyBaseEntity } from '@/table/my-base-entity';

// @ts-ignore
@Entity('collect', { comment: '收藏表' })
export class CollectEntity extends MyBaseEntity {
  // @ts-ignore
  @Column('varchar', { comment: '收藏的类型' })
  type: string;

  // @ts-ignore
  @Column('varchar', { comment: '收藏的url' })
  url: string;

  // @ts-ignore
  @Column('varchar', { comment: '收藏的内容' })
  value: string;

  // @ts-ignore
  @Column('integer', { comment: '观看次数' })
  count: number;
}
