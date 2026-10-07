import { Button } from "@cloudflare/kumo";
import { Link } from "react-router";
import { useState } from "react";
import { authClient } from "~/lib/auth-client";

export default function AccountMenu() {
	const { data: session } = authClient.useSession();
	const [error, setError] = useState(false);
	return <div className="flex items-center gap-3 text-sm">
		{session?.user.role === "admin" && <Link to="/team" className="text-kumo-subtle">팀원 관리</Link>}
		<Link to="/account" className="text-kumo-subtle">내 계정</Link>
		<Button variant="ghost" size="sm" onClick={async () => {
			setError(false);
			try {
				const result = await authClient.signOut();
				if (result.error) setError(true);
				else window.location.assign("/login");
			} catch { setError(true); }
		}}>로그아웃</Button>
		{error && <span role="alert">다시 시도해주세요.</span>}
	</div>;
}
