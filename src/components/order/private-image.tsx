import { createEffect, createSignal, on, onCleanup, Show } from "solid-js";

import { cn } from "~/lib/utils";

/**
 * Shows an image that needs the signed-in session (payment screenshots,
 * delivery photos). Loaded with fetch() and shown from a blob URL: plain <img>
 * requests for app routes don't reach the app in the dev server, and this also
 * keeps private photos out of the browser's image cache.
 */
export function PrivateImage(props: {
	url: string;
	alt: string;
	class?: string;
	placeholderClass?: string;
}) {
	const [src, setSrc] = createSignal<string>();
	const [failed, setFailed] = createSignal(false);
	let objectUrl: string | undefined;
	const release = () => {
		if (objectUrl) URL.revokeObjectURL(objectUrl);
		objectUrl = undefined;
	};
	createEffect(
		on(
			() => props.url,
			async (url) => {
				setFailed(false);
				try {
					const response = await fetch(url, { credentials: "same-origin" });
					if (!response.ok) throw new Error(String(response.status));
					release();
					objectUrl = URL.createObjectURL(await response.blob());
					setSrc(objectUrl);
				} catch {
					setFailed(true);
				}
			},
		),
	);
	onCleanup(release);
	return (
		<Show
			when={src()}
			fallback={
				<span
					class={cn(
						"flex h-40 items-center justify-center text-xs text-petal-900/55",
						props.placeholderClass,
					)}
				>
					{failed() ? "Couldn’t load the photo." : "Loading photo…"}
				</span>
			}
		>
			{(source) => <img src={source()} alt={props.alt} class={props.class} />}
		</Show>
	);
}
