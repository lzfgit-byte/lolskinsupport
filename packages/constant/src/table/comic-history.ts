import { Column, Entity } from 'typeorm';
import { MyBaseEntity } from '@/table/my-base-entity';

// @ts-ignore
@Entity('comic_history', { comment: '漫画阅读记录表' })
export class ComicHistory extends MyBaseEntity {
  // @ts-ignore
  @Column('varchar', { comment: '详情页url' })
  detailUrl: string;

  // @ts-ignore
  @Column('varchar', { comment: '正在阅读的目录url' })
  contentUrl: string;

  // @ts-ignore
  @Column('integer', { comment: '观看到的图片数' })
  currentImage: number;
}
