import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { client, db } from './index';

await migrate(db, { migrationsFolder: new URL('../../../../drizzle/migrations', import.meta.url).pathname });
await client.end();
console.log('Migrasi database selesai');
