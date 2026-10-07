import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { Button, Input } from "@cloudflare/kumo";
import { authClient } from "~/lib/auth-client";
import AccountMenu from "~/components/AccountMenu";

export default function Account() {
	const [currentPassword, setCurrent] = useState("");
	const [newPassword, setNew] = useState("");
	const [message, setMessage] = useState("");
	const [busy, setBusy] = useState(false);
	async function submit(e: FormEvent) {
		e.preventDefault(); setBusy(true); setMessage("");
		try {
			const result = await authClient.changePassword({ currentPassword, newPassword, revokeOtherSessions: true });
			setMessage(result.error ? "현재 비밀번호를 확인해주세요." : "비밀번호가 변경됐습니다. 다른 기기의 로그인은 해제됐습니다.");
			if (!result.error) { setCurrent(""); setNew(""); }
		} catch { setMessage("변경하지 못했습니다. 잠시 후 다시 시도해주세요."); }
		finally { setBusy(false); }
	}
	return <main className="max-w-lg mx-auto p-6 space-y-8">
		<div className="flex justify-between"><Link to="/">← 메일함</Link><AccountMenu /></div>
		<h1 className="text-2xl font-semibold">비밀번호 변경</h1>
		<form className="space-y-5" onSubmit={submit}>
			<Input label="현재 비밀번호" type="password" autoComplete="current-password" required value={currentPassword} onChange={e => setCurrent(e.target.value)} />
			<Input label="새 비밀번호 (12자 이상)" type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={newPassword} onChange={e => setNew(e.target.value)} />
			{message && <p role="status">{message}</p>}
			<Button variant="primary" type="submit" loading={busy} disabled={busy}>비밀번호 변경</Button>
		</form>
	</main>;
}
