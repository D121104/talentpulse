import 'dotenv/config';
import { DataSource } from 'typeorm';
import { createDataSourceOptions } from './data-source-options';

export { createDataSourceOptions } from './data-source-options';

export default new DataSource(createDataSourceOptions());
