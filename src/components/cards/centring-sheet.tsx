import { For } from "solid-js";

import { SHEET } from "./card-sheets";
import { FOLD_SHEET } from "./folded-sheets";

/** How far each scale reaches either side of the middle, in mm. */
const REACH = 10;
/** A mark every half millimetre. */
const TICKS = Array.from({ length: REACH * 4 + 1 }, (_, i) => i / 2 - REACH);
const INK = "#1f1216";
const FONT = "Inter, sans-serif";

/** Mark length, in mm, like a ruler: 0, then every 5, whole millimetres, halves. */
const tickLength = (t: number) =>
	t === 0 ? 6.5 : t % 5 === 0 ? 4.5 : Number.isInteger(t) ? 3 : 1.6;
const tickLabel = (t: number) => (t > 0 ? `+${t}` : String(t));

/**
 * A millimetre scale on one line through the middle of the paper. The fold
 * that halves the paper crosses it at the number to enter.
 */
function Scale(props: {
	/** "across" runs left to right and reads the upright crease. */
	dir: "across" | "down";
	/** Where the scale's 0 sits, in mm. */
	x: number;
	y: number;
	label: string;
}) {
	const across = () => props.dir === "across";
	return (
		<g>
			<For each={TICKS}>
				{(t) => {
					const len = tickLength(t);
					const labelled = t % 5 === 0;
					return (
						<>
							<line
								x1={across() ? props.x + t : props.x}
								x2={across() ? props.x + t : props.x + len}
								y1={across() ? props.y - len : props.y + t}
								y2={across() ? props.y : props.y + t}
								stroke={INK}
								stroke-width={t === 0 ? 0.25 : 0.14}
							/>
							{labelled && (
								<text
									x={across() ? props.x + t : props.x + 6.8}
									y={across() ? props.y + 3.4 : props.y + t + 0.8}
									font-size="2.2"
									font-weight={t === 0 ? 700 : 400}
									text-anchor={across() ? "middle" : "start"}
									fill={INK}
									font-family={FONT}
								>
									{tickLabel(t)}
								</text>
							)}
						</>
					);
				}}
			</For>
			{/* The scale's own line. */}
			<line
				x1={across() ? props.x - REACH : props.x}
				x2={across() ? props.x + REACH : props.x}
				y1={across() ? props.y : props.y - REACH}
				y2={across() ? props.y : props.y + REACH}
				stroke={INK}
				stroke-width="0.14"
			/>
			<text
				x={across() ? props.x : props.x}
				y={across() ? props.y - 7.5 : props.y - REACH - 3}
				font-size="2.8"
				font-weight="600"
				text-anchor="middle"
				fill={INK}
				font-family={FONT}
			>
				{props.label}
			</text>
		</g>
	);
}

/**
 * A test page for cutting with a guillotine. Folded in half both ways, edge
 * on edge, the creases mark the paper's true middle; where they cross the two
 * scales is how far this printer is off, which is the number to enter.
 * Printed with no correction, so it measures the printer as it is.
 */
export function CentringSheet(props: { landscape: boolean }) {
	const box = () => (props.landscape ? FOLD_SHEET : SHEET);
	const cx = () => box().width / 2;
	const cy = () => box().height / 2;
	return (
		<div
			class="card-sheet relative bg-white text-[#1f1216]"
			style={{ width: `${box().width}mm`, height: `${box().height}mm` }}
		>
			<svg
				role="img"
				aria-label="Centring test: two millimetre scales on the middle lines of the paper"
				viewBox={`0 0 ${box().width} ${box().height}`}
				class="absolute inset-0 size-full"
			>
				<title>Centring test</title>
				{/* Where the creases should fall: faint, right across. */}
				<line
					x1={cx()}
					x2={cx()}
					y1={8}
					y2={box().height - 8}
					stroke="#d6cdd1"
					stroke-width="0.12"
					stroke-dasharray="1.5 1.5"
				/>
				<line
					y1={cy()}
					y2={cy()}
					x1={8}
					x2={box().width - 8}
					stroke="#d6cdd1"
					stroke-width="0.12"
					stroke-dasharray="1.5 1.5"
				/>
				{/* Apart, so neither gets in the other's way. */}
				<Scale
					dir="across"
					x={cx()}
					y={cy() + box().height * 0.25}
					label="Move right"
				/>
				<Scale
					dir="down"
					x={cx() + box().width * 0.25}
					y={cy()}
					label="Move down"
				/>
			</svg>

			<div
				class="absolute font-sans text-[#2b1a20]"
				style={{
					left: "12mm",
					top: "12mm",
					width: props.landscape ? "110mm" : "80mm",
					"font-size": "8pt",
					"line-height": "1.45",
				}}
			>
				<p class="font-semibold" style={{ "font-size": "11pt" }}>
					Centring test, for the cutter
				</p>
				<ol class="m-0 mt-[2mm] list-decimal pl-[4.5mm]">
					<li>
						Fold this sheet in half, edge exactly on edge, and crease it. Unfold
						it, fold it in half the other way, and crease again.
					</li>
					<li>
						Read the number where the upright crease crosses the{" "}
						<strong>Move right</strong> scale, and where the flat crease crosses
						the <strong>Move down</strong> scale. Between two marks? Use the
						half.
					</li>
					<li>
						Enter both under <strong>Line up with the cutter</strong>. Print
						this again to check: each crease should now cross its scale at 0.
					</li>
				</ol>
			</div>
		</div>
	);
}
