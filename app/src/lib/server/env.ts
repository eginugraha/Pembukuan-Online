function required(name: string): string {
	const value = process.env[name];
	if (!value) throw new Error(`Environment variable ${name} wajib diisi`);
	return value;
}

export const env = {
	get DATABASE_URL() {
		return required('DATABASE_URL');
	},
	get BETTER_AUTH_SECRET() {
		return required('BETTER_AUTH_SECRET');
	},
	get BETTER_AUTH_URL() {
		return process.env.BETTER_AUTH_URL ?? 'http://localhost:5173';
	},
	get SIDECAR_URL() {
		return process.env.SIDECAR_URL ?? 'http://localhost:8000';
	},
	get OLLAMA_URL() {
		return process.env.OLLAMA_URL ?? 'http://localhost:11434';
	},
	get OLLAMA_MODEL() {
		return process.env.OLLAMA_MODEL ?? 'qwen2.5:7b';
	}
};

/** Dipanggil saat server start agar env wajib yang kosong gagal cepat dengan pesan jelas. */
export function assertRuntimeEnv(): void {
	void env.DATABASE_URL;
	void env.BETTER_AUTH_SECRET;
}
