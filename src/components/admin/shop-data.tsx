import { createSignal, Show } from "solid-js";

import {
	adminButton,
	ConfirmButton,
	SettingsRow,
	SettingsSection,
	toastError,
	toastSuccess,
} from "~/components/admin/ui";

interface ImportResponse {
	ok: boolean;
	message?: string;
	summary?: {
		exportedAt: string;
		rows: Record<string, number>;
		uploads: number;
		backup?: string;
	};
}

const code = "whitespace-nowrap rounded bg-petal-50 px-1 font-mono text-xs";

/**
 * For the owner: a copy of the live shop to test with on a computer, and,
 * on that computer only, a way to load one in.
 */
export function ShopDataSection() {
	return (
		<SettingsSection
			title="Your data"
			description="A full copy of the shop holds real customers’ names, emails and payment proofs. Keep it private and delete it when you’re done."
		>
			<SettingsRow
				label="Copy the shop to your computer"
				description={
					<>
						One zip with bouquets, flowers, wrappers, orders, accounts, settings
						and every photo, to test with locally. Login sessions are left out.
						Load it with{" "}
						<code class={code}>bun run data:import &lt;file.zip&gt;</code>.
					</>
				}
				end
			>
				<a
					href="/api/admin/data-export"
					download=""
					class={adminButton.secondary}
				>
					<DownloadIcon />
					Download all data
				</a>
			</SettingsRow>
			{/* Only on your own computer: the live shop never offers this. */}
			<Show when={import.meta.env.DEV}>
				<ImportRow />
			</Show>
		</SettingsSection>
	);
}

/** Loads a Download all data zip in place of this computer's shop. */
function ImportRow() {
	const [file, setFile] = createSignal<File | null>(null);
	let input!: HTMLInputElement;

	const runImport = async () => {
		const zip = file();
		if (!zip) return;
		try {
			const response = await fetch("/api/admin/data-import", {
				method: "POST",
				headers: { "Content-Type": "application/zip" },
				body: zip,
			});
			const result = (await response
				.json()
				.catch(() => ({ ok: false }))) as ImportResponse;
			if (!result.ok || !result.summary)
				throw new Error(result.message ?? "Couldn’t import that file.");
			const rows = result.summary.rows;
			toastSuccess(
				`Imported ${rows.orders ?? 0} orders, ${rows.signature_bouquets ?? 0} bouquets and ${result.summary.uploads} photos. Sign in with your live-site password.`,
			);
			// Login sessions aren't in the export, so this one is gone too.
			window.location.assign("/admin");
		} catch (error) {
			toastError(error);
		}
	};

	return (
		<SettingsRow
			label={
				<span class="flex flex-wrap items-center gap-2">
					Load a copy here
					<span class="rounded-full bg-sage-100 px-2 py-0.5 text-[11px] font-medium text-sage-600">
						This computer only
					</span>
				</span>
			}
			description={
				<>
					Replaces this computer’s shop with a zip from Download all data.
					What’s here now moves to <code class={code}>.data-backups/</code>,
					never deleted. You’ll be signed out: sign in again with your live-site
					password.
				</>
			}
			extra={
				<p class="mt-2 text-sm text-petal-900/65 wrap-anywhere">
					{file()?.name ?? "No file chosen"}
				</p>
			}
			end
		>
			<div class="flex flex-wrap items-center gap-2 sm:justify-end">
				<input
					ref={input}
					type="file"
					accept=".zip,application/zip"
					class="sr-only"
					onChange={(e) => setFile(e.currentTarget.files?.[0] ?? null)}
				/>
				<button
					type="button"
					class={adminButton.secondary}
					onClick={() => input.click()}
				>
					Choose zip…
				</button>
				<ConfirmButton
					title="Replace this shop’s data?"
					description={`Everything here is replaced with ${file()?.name ?? "the zip"}. Your current data is kept in .data-backups/.`}
					confirmLabel="Import"
					onConfirm={runImport}
					disabled={!file()}
					class={adminButton.primary}
				>
					Import
				</ConfirmButton>
			</div>
		</SettingsRow>
	);
}

function DownloadIcon() {
	return (
		<svg
			aria-hidden="true"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="1.8"
			stroke-linecap="round"
			stroke-linejoin="round"
			class="size-4"
		>
			<path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
		</svg>
	);
}
