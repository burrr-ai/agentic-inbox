import type { Mailbox } from "~/types";

export default function ComposeExtras({ from, onFromChange, mailboxes, files, onFilesChange, disabled }: {
	from: string; onFromChange: (value: string) => void; mailboxes: Mailbox[];
	files: File[]; onFilesChange: (files: File[]) => void; disabled: boolean;
}) {
	return <div className="space-y-3">
		<label className="block text-sm">발신 주소
			<select aria-label="발신 주소" value={from} onChange={e => onFromChange(e.target.value)} disabled={disabled} className="mt-1 block w-full rounded border border-kumo-line bg-kumo-base p-2">
				{mailboxes.map(mailbox => <option key={mailbox.id} value={mailbox.email}>{mailbox.email}</option>)}
			</select>
		</label>
		<label className="block text-sm">첨부파일 <span className="text-kumo-subtle">(최대 10개 · 합계 3MB)</span>
			<input aria-label="첨부파일" type="file" multiple disabled={disabled} className="mt-1 block w-full text-sm" onChange={e => { onFilesChange([...files, ...Array.from(e.target.files || [])]); e.target.value = ""; }} />
		</label>
		{files.length > 0 && <ul className="space-y-1 text-sm">{files.map((file, i) => <li key={`${file.name}-${i}`} className="flex justify-between gap-2"><span className="truncate">{file.name} ({Math.ceil(file.size / 1024)} KB)</span><button type="button" disabled={disabled} onClick={() => onFilesChange(files.filter((_, index) => index !== i))} aria-label={`${file.name} 첨부 제거`}>제거</button></li>)}</ul>}
	</div>;
}
