import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>");
Object.assign(globalThis, { window: dom.window, document: dom.window.document });
const { prepareQuotedHtml } = await import("../app/lib/quoted-html.ts");
const { Editor } = await import("@tiptap/core");
const { default: StarterKit } = await import("@tiptap/starter-kit");

function editorRoundtrip(html: string) {
	const editor = new Editor({ extensions: [StarterKit], content: html });
	const result = editor.getHTML();
	editor.destroy();
	return result;
}

test("repeated replies retain paragraphs, links, nested quotes and entities", () => {
	let html = '<p>시안 보내드립니다.</p><p>1페이지 인쇄<br>2페이지 인쇄</p><blockquote><p>From: &lt;admin@clovair.dev&gt;</p><p>A &amp; B&nbsp;회사</p><a href="https://example.com">확인</a></blockquote>';
	for (let i = 0; i < 3; i++) html = editorRoundtrip(`<blockquote><p>Sender wrote:</p>${prepareQuotedHtml(html)}</blockquote>`);
	const output = new JSDOM(html).window.document;
	assert.equal(output.querySelectorAll("blockquote").length, 4);
	assert.ok(output.querySelectorAll("p").length >= 7);
	assert.match(output.body.textContent!, /From: <admin@clovair.dev>/);
	assert.match(output.body.textContent!, /A & B\u00a0회사/);
	assert.equal(output.querySelector("a")?.getAttribute("href"), "https://example.com");
	assert.doesNotMatch(html, /&amp;amp;|&amp;lt;|&amp;nbsp;/);
	assert.match(html, /인쇄<br>2페이지/);
});

test("active content and styles never enter the compose editor", () => {
	const result = prepareQuotedHtml('<style>p{color:red}</style><script>alert(1)</script><p onclick="alert(1)">safe</p><img src=x onerror="alert(1)"><a href="javascript:alert(1)">bad</a><iframe src="https://example.com"></iframe>');
	assert.doesNotMatch(result, /script|onclick|onerror|iframe|<img|color:red/);
	assert.match(result, /<p>safe<\/p>/);
});

test("div-based emails retain line boundaries through the actual editor", () => {
	const html = editorRoundtrip(prepareQuotedHtml('<div>첫 문단</div><div>둘째 문단</div><table><tr><td>셋째</td></tr><tr><td>넷째</td></tr></table>'));
	assert.match(html, /첫 문단<br>/);
	assert.match(html, /둘째 문단<br>/);
	assert.match(html, /셋째 <br>/);
});
