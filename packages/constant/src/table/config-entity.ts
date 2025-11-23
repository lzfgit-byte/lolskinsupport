import { Column, Entity } from 'typeorm';
import { MyBaseEntity } from '@/table/my-base-entity';
/**
 *配置表
 */
// @ts-ignore
@Entity('config', { comment: '系统配置表' })
export class ConfigEntity extends MyBaseEntity {
  // @ts-ignore
  @Column('varchar', { comment: '配置名称' })
  name: string;

  // @ts-ignore
  @Column('varchar', { comment: '配置值' })
  value: string;
}
