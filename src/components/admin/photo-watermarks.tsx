import { useRouter } from "@tanstack/solid-router";
import { createSignal, onCleanup, onMount, Show } from "solid-js";

import { makeThumbnail, productPhotoId } from "~/lib/photos";
import { cn } from "~/lib/utils";
import { watermarkPhoto } from "~/lib/watermark";
import {
	listPhotosToWatermark,
	replaceBouquetPhoto,
} from "~/server/admin/catalog";
import { adminButton, adminCard, toastError, toastSuccess } from "./ui";

/** A bouquet photo's clean, unwatermarked version (staff only). */
async function fetchOriginal(url: string) {
	const id = productPhotoId(url);
	const response = await fetch(`/api/admin/photo-originals/${id}`);
	if (!response.ok) throw new Error("No clean copy of that photo.");
	return response.blob();
}

/** What needs doing, e.g. "44 photos have an older version of the watermark." */
function describe(total: number, outdated: number) {
	const photos = (n: number) => `${n} ${n === 1 ? "photo" : "photos"}`;
	const fresh = total - outdated;
	const parts = [
		fresh > 0 &&
			`${photos(fresh)} ${fresh === 1 ? "doesn’t" : "don’t"} have the ORAIA watermark yet.`,
		outdated > 0 &&
			`${photos(outdated)} ${outdated === 1 ? "has" : "have"} an older version of the watermark.`,
	];
	return parts.filter(Boolean).join(" ");
}

/**
 * Bouquet photos uploaded before the watermark, or stamped with an older
 * version of it: shows how one will look, then stamps them one at a time in
 * this browser. Hidden once every photo has the current watermark.
 */
export function WatermarkPhotos() {
	const router = useRouter();
	const [missing, setMissing] = createSignal<string[]>([]);
	/** How many of them carry an older watermark, to be redone. */
	const [outdated, setOutdated] = createSignal(0);
	const [preview, setPreview] = createSignal<string>();
	const [done, setDone] = createSignal(0);
	const [running, setRunning] = createSignal(false);

	const showPreview = async (url: string | undefined) => {
		if (!url) return;
		try {
			const stamped = await watermarkPhoto(await fetchOriginal(url));
			const previous = preview();
			setPreview(URL.createObjectURL(stamped));
			if (previous) URL.revokeObjectURL(previous);
		} catch {
			// The preview is a nicety; stamping still works without it.
		}
	};

	onMount(async () => {
		try {
			const { urls, outdated } = await listPhotosToWatermark();
			setMissing(urls);
			setOutdated(outdated);
			await showPreview(urls[0]);
		} catch {
			// Nothing to offer if the list can't be read.
		}
	});
	onCleanup(() => {
		const url = preview();
		if (url) URL.revokeObjectURL(url);
	});

	const run = async () => {
		setRunning(true);
		setDone(0);
		let failed = 0;
		for (const url of missing()) {
			try {
				const stamped = await watermarkPhoto(await fetchOriginal(url));
				const body = new FormData();
				body.set("url", url);
				body.set("file", stamped, "photo.jpg");
				body.set("thumb", await makeThumbnail(stamped), "thumbnail.jpg");
				const result = await replaceBouquetPhoto({ data: body });
				if (!result.ok) throw new Error(result.message);
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
					`${failed} of ${total} photos couldn’t be watermarked. Try again later.`,
				),
			);
		else toastSuccess(`Watermark done on all ${total} photos.`);
		const { urls, outdated } = await listPhotosToWatermark().catch(() => ({
			urls: [] as string[],
			outdated: 0,
		}));
		setMissing(urls);
		setOutdated(outdated);
		// The list's photos now have new addresses.
		await router.invalidate();
	};

	return (
		<Show when={missing().length > 0}>
			<section
				class={cn(adminCard, "mb-6 flex flex-wrap items-center gap-4 p-4")}
			>
				<Show when={preview()}>
					{(src) => (
						<img
							src={src()}
							alt="Preview: a bouquet with the watermark"
							width={96}
							height={96}
							class="size-24 shrink-0 rounded-xl border border-petal-100 object-cover"
						/>
					)}
				</Show>
				<div class="min-w-0 flex-1 basis-64 text-sm">
					<p class="font-medium">
						{outdated() === missing().length
							? "Update the watermark on bouquet photos"
							: "Add the watermark to bouquet photos"}
					</p>
					<p class="text-petal-900/65">
						{running()
							? `Watermarking ${done()} of ${missing().length} photos… Keep this page open.`
							: `${describe(missing().length, outdated())} Each is redone from its clean original, never stamped twice, and new uploads get the new watermark automatically. Uses Wi-Fi: each photo is downloaded and uploaded once.`}
					</p>
				</div>
				<button
					type="button"
					class={adminButton.primary}
					disabled={running()}
					onClick={run}
				>
					{running()
						? "Watermarking…"
						: outdated() === missing().length
							? "Update watermark"
							: "Add watermark"}
				</button>
			</section>
		</Show>
	);
}
