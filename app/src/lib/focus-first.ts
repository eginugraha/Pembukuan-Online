/** Fokus ke kontrol interaktif pertama di dalam elemen ber-id (mis. segmen tanggal), bila elemen itu bukan kontrol native. */
export function focusFirstControl(id: string): void {
	const el = document.getElementById(id);
	if (!el || ['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(el.tagName)) return;
	el.querySelector<HTMLElement>('[role="spinbutton"], input, button')?.focus();
}
