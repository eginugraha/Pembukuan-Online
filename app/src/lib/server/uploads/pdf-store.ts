import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const baseDir = () => process.env.UPLOAD_DIR ?? './data/uploads';

// Nama file dibentuk dari UUID tervalidasi (parseId) / hasil DB, bukan dari input mentah.
const pathFor = (companyId: string, uploadId: string) => join(baseDir(), companyId, `${uploadId}.pdf`);

export async function saveStatementPdf(companyId: string, uploadId: string, content: Uint8Array): Promise<void> {
	await mkdir(join(baseDir(), companyId), { recursive: true });
	await writeFile(pathFor(companyId, uploadId), content);
}

export async function readStatementPdf(companyId: string, uploadId: string): Promise<Uint8Array | null> {
	return readFile(pathFor(companyId, uploadId)).catch((e: NodeJS.ErrnoException) => {
		if (e.code === 'ENOENT') return null;
		throw e;
	});
}

export async function removeStatementPdf(companyId: string, uploadId: string): Promise<void> {
	await rm(pathFor(companyId, uploadId), { force: true });
}
