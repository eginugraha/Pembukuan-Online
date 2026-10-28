import { ApiError } from '../api';
import type { SignerInput } from './signers';

/** Form multipart: `name`, `title`, dan `file` (gambar tanda tangan, opsional). */
export async function readSignerForm(request: Request): Promise<SignerInput> {
	const form = await request.formData().catch(() => null);
	if (!form) throw new ApiError(400, 'validation_error', 'Data penandatangan tidak valid');
	const file = form.get('file');
	const removeImage = form.get('removeImage') === '1';
	return {
		name: String(form.get('name') ?? ''),
		title: String(form.get('title') ?? '') || null,
		image: file instanceof File && file.size > 0 ? new Uint8Array(await file.arrayBuffer()) : removeImage ? null : undefined
	};
}
