import DOMPurify from "dompurify";

/** Preserve quote structure without bringing active email content into the editor. */
export function prepareQuotedHtml(html: string): string {
	const fragment = DOMPurify.sanitize(html, {
		ALLOWED_TAGS: ["p", "div", "br", "blockquote", "strong", "b", "em", "i", "u", "s", "a", "ul", "ol", "li", "h1", "h2", "h3", "h4", "h5", "h6", "pre", "code", "hr", "span", "table", "tbody", "thead", "tr", "td", "th"],
		ALLOWED_ATTR: ["href", "title", "start"],
		FORBID_TAGS: ["style", "script"],
		RETURN_DOM_FRAGMENT: true,
	});
	// TipTap does not retain generic divs or tables. Keep their text boundaries
	// explicitly rather than letting its parser concatenate adjacent blocks.
	for (const cell of fragment.querySelectorAll("td, th")) cell.appendChild(document.createTextNode(" "));
	for (const block of Array.from(fragment.querySelectorAll("div, tr")).reverse()) {
		block.appendChild(document.createElement("br"));
	}
	// Remove table containers before serializing so HTML reparsing cannot
	// foster-parent the inserted line breaks outside their rows.
	for (const tableNode of Array.from(fragment.querySelectorAll("table, tbody, thead, tr, td, th")).reverse()) {
		const parent = tableNode.parentNode!;
		while (tableNode.firstChild) parent.insertBefore(tableNode.firstChild, tableNode);
		parent.removeChild(tableNode);
	}
	const container = document.createElement("div");
	container.appendChild(fragment);
	return container.innerHTML;
}
