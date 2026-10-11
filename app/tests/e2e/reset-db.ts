import { runSeed } from '../../seeds/index';
import { client } from '../../src/lib/server/db';
import { resetDb } from '../integration/db';

await resetDb();
await runSeed();
await client.end();
