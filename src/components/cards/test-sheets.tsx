import { For, Show } from "solid-js";

import { CARDS_PER_SHEET } from "~/lib/print-cards";
import { Sheet } from "./card-sheets";
import { FoldedSheet } from "./folded-sheets";

/**
 * A numbered test sheet, laid out exactly like real cards: each spot says
 * which card it is and which side. Printed the same way as a real batch, the
 * back of card 1 should sit behind card 1, the right way up.
 */
export function TestSheet(props: {
	folded: boolean;
	side: "message" | "oraia";
	/** Each spot's card number, already mirrored for the ORAIA side. */
	numbers: (number | undefined)[];
	guides?: boolean;
	label?: string;
	upsideDown?: boolean;
}) {
	const spots = () => (
		<For each={Array.from({ length: CARDS_PER_SHEET })}>
			{(_, spot) => <TestSpot n={props.numbers[spot()]} side={props.side} />}
		</For>
	);
	return (
		<Show
			when={props.folded}
			fallback={
				<Sheet
					guides={props.guides}
					label={props.label}
					upsideDown={props.upsideDown}
				>
					{spots()}
				</Sheet>
			}
		>
			<FoldedSheet
				guides={props.guides}
				label={props.label}
				upsideDown={props.upsideDown}
			>
				{spots()}
			</FoldedSheet>
		</Show>
	);
}

function TestSpot(props: { n?: number; side: "message" | "oraia" }) {
	return (
		<div class="relative flex min-h-0 flex-col items-center justify-center text-center font-sans">
			<Show
				when={props.n}
				fallback={
					<span class="text-[9pt] text-[#9d9195]">
						Empty spot (
						{props.side === "message" ? "message side" : "ORAIA side"})
					</span>
				}
			>
				{(n) => (
					<>
						<span
							class="absolute font-medium uppercase text-[#9d9195]"
							style={{
								top: "8mm",
								"font-size": "7pt",
								"letter-spacing": "0.2em",
							}}
						>
							↑ This edge up ↑
						</span>
						<span
							class="font-display font-semibold leading-none text-petal-900"
							style={{ "font-size": "64pt" }}
						>
							{n()}
						</span>
						<span
							class="mt-[3mm] font-medium uppercase text-petal-700"
							style={{ "font-size": "9pt", "letter-spacing": "0.16em" }}
						>
							Card {n()} ·{" "}
							{props.side === "message" ? "message side" : "ORAIA side"}
						</span>
					</>
				)}
			</Show>
		</div>
	);
}
