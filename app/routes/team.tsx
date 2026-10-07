import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router";
import { Button, Input } from "@cloudflare/kumo";
import { authClient } from "~/lib/auth-client";

export default function Team() {
	const { data: session, isPending } = authClient.useSession();
	const [users, setUsers] = useState<{ id: string; name: string; email: string; role?: string | null }[]>([]);
	const [name, setName] = useState("");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [busy, setBusy] = useState(false);
	const [message, setMessage] = useState("");
	async function refresh() {
		try {
			const result = await authClient.admin.listUsers({ query: { limit: 100 } });
			if (result.error) setMessage("팀원 목록을 불러오지 못했습니다.");
			else setUsers(result.data.users);
		} catch { setMessage("팀원 목록을 불러오지 못했습니다."); }
	}
	useEffect(() => { if (session?.user.role === "admin") void refresh(); }, [session?.user.role]);
	async function submit(e: FormEvent) {
		e.preventDefault(); setBusy(true); setMessage("");
		try {
			const result = await authClient.admin.createUser({ name, email, password, role: "user" });
			if (result.error) setMessage("계정을 만들지 못했습니다. 이메일 중복 여부와 입력값을 확인해주세요.");
			else {
				setName(""); setEmail(""); setPassword(""); await refresh();
				setMessage("계정을 만들었습니다. 팀원에게 로그인 정보를 직접 전달해주세요.");
			}
		} catch { setMessage("계정을 만들지 못했습니다. 잠시 후 다시 시도해주세요."); }
		finally { setBusy(false); }
	}
	if (isPending) return <p className="p-8">불러오는 중…</p>;
	if (session?.user.role !== "admin") return <main className="p-8"><p>관리자만 사용할 수 있습니다.</p><Link to="/">메일함으로</Link></main>;
	return <main className="max-w-2xl mx-auto p-6 space-y-8">
		<Link to="/">← 메일함</Link>
		<div><h1 className="text-2xl font-semibold">팀원 관리</h1><p className="text-kumo-subtle mt-2">등록된 팀원은 모든 공용 메일함을 사용할 수 있습니다.</p></div>
		<ul className="divide-y divide-kumo-line border border-kumo-line rounded-lg">
			{users.map(user => <li key={user.id} className="p-4 flex justify-between gap-3"><div><p>{user.name}</p><p className="text-sm text-kumo-subtle">{user.email}</p></div><span className="text-sm">{user.role === "admin" ? "관리자" : "팀원"}</span></li>)}
		</ul>
		<form onSubmit={submit} className="space-y-4 rounded-lg border border-kumo-line p-6 bg-kumo-base">
			<h2 className="text-lg font-semibold">팀원 계정 만들기</h2>
			<Input label="이름" autoComplete="off" required value={name} onChange={e => setName(e.target.value)} />
			<Input label="로그인 이메일" type="email" autoComplete="off" required value={email} onChange={e => setEmail(e.target.value)} />
			<Input label="초기 비밀번호 (12자 이상)" type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={password} onChange={e => setPassword(e.target.value)} />
			<p className="text-xs text-kumo-subtle">메일함 생성과는 별개입니다. 팀원은 로그인 후 ‘내 계정’에서 비밀번호를 바꿀 수 있습니다.</p>
			{message && <p role="status" className="text-sm">{message}</p>}
			<Button type="submit" variant="primary" loading={busy} disabled={busy}>계정 만들기</Button>
		</form>
	</main>;
}
