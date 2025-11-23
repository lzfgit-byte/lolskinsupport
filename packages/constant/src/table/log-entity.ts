import { Column, Entity } from 'typeorm';
import { MyBaseEntity } from '@/table/my-base-entity';

/**
 *日志表
 */
// @ts-ignore
@Entity('log', { comment: '日志表' })
export class LogEntity extends MyBaseEntity {
  static log(info_: string, type_: 'info' | 'error' = 'info') {
    const info = info_ || '';
    const type = type_ || 'info';
    const entity = new LogEntity();
    entity.info = info;
    entity.type = type;
    entity.save().then(() => 1);
  }

  // @ts-ignore
  @Column('varchar', { comment: '日志内容' })
  info: string;

  // @ts-ignore
  @Column('varchar', { comment: '日志分类' })
  type: 'info' | 'error';
}
