import { createSignal, onMount, Show } from "solid-js";

import { makeThumbnail, photoSrc } from "~/lib/photos";
import { cn } from "~/lib/utils";
import {
	listPhotosWithoutThumbnails,
	saveProductThumbnail,
} from "~/server/admin/catalog";
import { adminButton, adminCard, toastError, toastSuccess } from "./ui";

/**
 * Makes and saves the card-sized copy of an uploaded product photo. The shop
 * falls back to the full photo without one, so a failure only costs speed.
 */
export async function saveThumbnailFor(url: string, photo: Blob) {
	const body = new FormData();
	body.set("url", url);
	body.set("file", await makeThumbnail(photo), "thumbnail.jpg");
	const result = await saveProductThumbnail({ data: body });
	if (!result.ok) throw new Error(result.message);
}

/**
 * Photos uploaded before card-sized copies existed: makes theirs, one at a
 * time, in this browser. Hidden once every photo has one.
 */
export function OptimizePhotos() {
	const [missing, setMissing] = createSignal<string[]>([]);
	const [done, setDone] = createSignal(0);
	const [running, setRunning] = createSignal(false);
	onMount(async () => {
		try {
			setMissing(await listPhotosWithoutThumbnails());
		} catch {
			// Only an optimisation; the list works without it.
		}
	});

	const run = async () => {
		setRunning(true);
		setDone(0);
		let failed = 0;
		for (const url of missing()) {
			try {
				const response = await fetch(photoSrc(url));
				if (!response.ok) throw new Error("Photo not found.");
				await saveThumbnailFor(url, await response.blob());
			} catch {
				failed++;
			}
			setDone((n) => n + 1);
		}
		setRunning(false);
		const total = missing().length;
		if (failed)
			toastError(
				new Error(
					`${failed} of ${total} photos couldn’t be optimized. Try again later.`,
				),
			);
		else toastSuccess(`All ${total} photos optimized.`);
		setMissing(await listPhotosWithoutThumbnails().catch(() => []));
	};

	return (
		<Show when={missing().length > 0}>
			<section
				class={cn(
					adminCard,
					"mb-6 flex flex-wrap items-center justify-between gap-3 p-4",
				)}
			>
				<div class="min-w-0 flex-1 basis-64 text-sm">
					<p class="font-medium">Make the shop load faster</p>
					<p class="text-petal-900/65">
						{running()
							? `Optimizing ${done()} of ${missing().length} photos… Keep this page open.`
							: `${missing().length} ${missing().length === 1 ? "photo doesn’t" : "photos don’t"} have a small copy for the shop’s cards yet. Making them downloads each photo once, so use Wi-Fi.`}
					</p>
				</div>
				<button
					type="button"
					class={adminButton.primary}
					disabled={running()}
					onClick={run}
				>
					{running() ? "Optimizing…" : "Optimize photos"}
				</button>
			</section>
		</Show>
	);
}
