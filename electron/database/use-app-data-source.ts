import type { LogLevel, LogMessage, QueryRunner } from 'typeorm';
import { DataSource, FileLogger } from 'typeorm';
import type { FileLoggerOptions, LoggerOptions } from 'typeorm/logger/LoggerOptions';
import { Tables } from '@ghs/constant';
import { APP_PATHS } from '../const/app-paths';
import { logger } from '../utils/logger';

class MyFileLogger extends FileLogger {
  constructor() {
    const options: LoggerOptions = 'all';
    const fileLoggerOptions: FileLoggerOptions = { logPath: '' };
    super(options, fileLoggerOptions);
  }

  protected writeLog(
    level: LogLevel,
    logMessage: LogMessage | LogMessage[],
    queryRunner?: QueryRunner
  ) {
    super.writeLog(level, logMessage, queryRunner);
  }

  protected write(strings: string | string[]) {
    logger.log(strings);
  }
}
const AppDataSource = new DataSource({
  type: 'sqlite',
  database: APP_PATHS.db_path,
  entities: Tables,
  synchronize: true,
  logging: true,
  logger: new MyFileLogger(),
});

export default async () => {
  await AppDataSource.initialize()
    .then(() => {
      console.log('Data Source has been initialized!');
    })
    .catch((err) => {
      console.error('Error during Data Source initialization', err);
    });
  return () => AppDataSource.destroy();
};
