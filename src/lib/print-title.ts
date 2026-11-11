import { onCleanup, onMount } from "solid-js";

/** "Nov 11", Manila time: the day it was printed. */
const today = () =>
	new Date().toLocaleDateString("en-US", {
		timeZone: "Asia/Manila",
		month: "short",
		day: "numeric",
	});

/**
 * A file name from its parts, with the day it was printed on the end:
 * "Rosana - Portrait 4 per page - Flowers - Nov 11". Characters a file name
 * can't hold are left out.
 */
export function printFileName(parts: (string | false | undefined)[]) {
	return [...parts, today()]
		.filter(Boolean)
		.map((part) =>
			String(part)
				.replace(/[\\/:*?"<>|]+/g, " ")
				.replace(/\s+/g, " ")
				.trim(),
		)
		.filter(Boolean)
		.join(" - ");
}

/**
 * While the page prints, gives it this title: browsers name a saved PDF
 * after the page's title. Covers the print button and Ctrl/Cmd+P alike, and
 * puts the real title back after.
 */
export function usePrintTitle(title: () => string) {
	onMount(() => {
		let saved = "";
		const before = () => {
			saved = document.title;
			document.title = title();
		};
		const after = () => {
			if (saved) document.title = saved;
			saved = "";
		};
		window.addEventListener("beforeprint", before);
		window.addEventListener("afterprint", after);
		onCleanup(() => {
			window.removeEventListener("beforeprint", before);
			window.removeEventListener("afterprint", after);
		});
	});
}
