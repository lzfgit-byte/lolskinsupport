import { ConfigEntity } from '@/table/config-entity';
import { LogEntity } from '@/table/log-entity';
import { ViewedHistoryEntity } from '@/table/viewed-history-entity';
import { CollectEntity } from '@/table/collect-entity';
import { SearchHistoryEntity } from '@/table/search-history-entity';
import { WebConfigEntity } from '@/table/web-config-entity';
import { ComicHistory } from '@/table/comic-history';

export * from './log-entity';
export * from './config-entity';
export * from './collect-entity';
export * from './viewed-history-entity';
export * from './search-history-entity';
export * from './web-config-entity';
export * from './comic-history';

export const Tables = [
  LogEntity,
  ConfigEntity,
  ViewedHistoryEntity,
  CollectEntity,
  SearchHistoryEntity,
  WebConfigEntity,
  ComicHistory,
];
