// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { Button, Input, Loader, useKumoToastManager } from "@cloudflare/kumo";
import { useEffect, useState } from "react";
import { useParams } from "react-router";
import { DiscordSubjectExclusions, parseSubjectExclusions } from "shared/discord-filters";
import { useMailbox, useUpdateMailbox } from "~/queries/mailboxes";

export default function SettingsRoute() {
	const { mailboxId } = useParams<{ mailboxId: string }>();
	const toastManager = useKumoToastManager();
	const { data: mailbox } = useMailbox(mailboxId);
	const updateMailboxMutation = useUpdateMailbox();

	const [displayName, setDisplayName] = useState("");
	const [discordKeywords, setDiscordKeywords] = useState("");
	const [isSaving, setIsSaving] = useState(false);

	useEffect(() => {
		if (mailbox) {
			setDisplayName(mailbox.settings?.fromName || mailbox.name || "");
			setDiscordKeywords((mailbox.settings?.discordSubjectExclusions || []).join("\n"));
		}
	}, [mailbox]);

	const handleSave = async () => {
		if (!mailbox || !mailboxId) return;
		const exclusions = DiscordSubjectExclusions.safeParse(parseSubjectExclusions(discordKeywords));
		if (!exclusions.success) {
			toastManager.add({ title: "키워드는 최대 100개, 각각 200자까지 입력할 수 있습니다.", variant: "error" });
			return;
		}
		setIsSaving(true);
		const settings = {
			...mailbox.settings,
			fromName: displayName,
			discordSubjectExclusions: exclusions.data,
		};
		try {
			await updateMailboxMutation.mutateAsync({ mailboxId, settings });
			toastManager.add({ title: "Settings saved!" });
		} catch {
			toastManager.add({
				title: "Failed to save settings",
				variant: "error",
			});
		} finally {
			setIsSaving(false);
		}
	};

	if (!mailbox) {
		return (
			<div className="flex justify-center py-20">
				<Loader size="lg" />
			</div>
		);
	}


	return (
		<div className="max-w-2xl px-4 py-4 md:px-8 md:py-6 h-full overflow-y-auto">
			<h1 className="text-lg font-semibold text-kumo-default mb-6">Settings</h1>

			<div className="space-y-6">
				{/* Account */}
				<div className="rounded-lg border border-kumo-line bg-kumo-base p-5">
					<div className="text-sm font-medium text-kumo-default mb-4">
						Account
					</div>
					<div className="space-y-3">
						<Input
							label="Display Name"
							value={displayName}
							onChange={(e) => setDisplayName(e.target.value)}
						/>
						<Input label="Email" type="email" value={mailbox.email} disabled />
					</div>
				</div>

				<section className="rounded-lg border border-kumo-line bg-kumo-base p-5">
					<h2 className="text-sm font-medium text-kumo-default mb-3">디스코드 알림 필터</h2>
					<p className="text-sm text-kumo-subtle mb-3">{mailbox.email}에 도착한 메일에만 적용됩니다. 제목에 아래 키워드가 하나라도 포함되면 디스코드 알림을 보내지 않습니다. 메일 저장과 Gmail 전달은 그대로 유지됩니다.</p>
					<label htmlFor="discord-keywords" className="block text-sm mb-2">제목 제외 키워드</label>
					<textarea id="discord-keywords" value={discordKeywords} onChange={e => setDiscordKeywords(e.target.value)} rows={5} placeholder={"자금일보\n광고"} className="w-full resize-y rounded-lg border border-kumo-line bg-kumo-recessed px-3 py-2 text-sm text-kumo-default focus:outline-none focus:ring-1 focus:ring-kumo-ring" />
					<p className="text-xs text-kumo-subtle mt-2">한 줄에 하나씩 입력하세요. 영문 대소문자는 구분하지 않으며, 입력한 문구 그대로 포함 여부를 확인합니다. 모두 지우고 저장하면 모든 수신 메일의 알림을 받습니다.</p>
				</section>

				{/* Save */}
				<div className="flex justify-end">
					<Button variant="primary" onClick={handleSave} loading={isSaving}>
						Save Changes
					</Button>
				</div>
			</div>
		</div>
	);
}
