import { useState, type FormEvent } from "react";
import { Button, Input } from "@cloudflare/kumo";
import { authClient } from "~/lib/auth-client";

export function meta() { return [{ title: "로그인 · Clovair Mail" }]; }

export default function Login() {
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [rememberMe, setRememberMe] = useState(true);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState("");
	async function submit(event: FormEvent) {
		event.preventDefault(); setBusy(true); setError("");
		try {
			const result = await authClient.signIn.email({ email, password, rememberMe });
			if (result.error) setError(result.error.status === 429 ? "잠시 후 다시 시도해주세요." : "이메일과 비밀번호를 확인해주세요.");
			else window.location.assign("/");
		} catch { setError("로그인할 수 없습니다. 잠시 후 다시 시도해주세요."); }
		finally { setBusy(false); }
	}
	return <main className="min-h-screen flex items-center justify-center p-6">
		<form onSubmit={submit} className="w-full max-w-sm space-y-5 rounded-xl border border-kumo-line bg-kumo-base p-8 shadow-sm">
			<div><p className="text-sm text-kumo-subtle mb-2">주식회사 클로베어</p><h1 className="text-2xl font-semibold">팀 메일 로그인</h1></div>
			<Input label="이메일" type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} />
			<Input label="비밀번호" type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} />
			<label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={rememberMe} onChange={e => setRememberMe(e.target.checked)} />로그인 유지</label>
			{error && <p role="alert" className="text-sm text-red-600">{error}</p>}
			<Button type="submit" variant="primary" className="w-full" loading={busy} disabled={busy}>로그인</Button>
			<p className="text-xs text-kumo-subtle">계정 등록이나 비밀번호 초기화는 팀 관리자에게 요청해주세요.</p>
		</form>
	</main>;
}
