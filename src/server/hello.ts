import { createServerFn } from "@tanstack/solid-start";

import {
	HELLO_HEADING_MAX,
	HELLO_MESSAGE_MAX,
	type HelloNote,
} from "~/lib/hello-page";
import { requireStaff } from "./admin-auth";
import { getHelloNote, saveHelloNote } from "./hello-repo";
import { asRecord, text } from "./validate";

/** The note at the top of /hello; public, it's what the QR code opens. */
export const getHelloNoteFn = createServerFn({ method: "GET" }).handler(
	(): HelloNote => getHelloNote(),
);

export const saveHelloNoteFn = createServerFn({ method: "POST" })
	.validator((input: unknown): HelloNote => {
		const source = asRecord(input);
		return {
			heading: text(source, "heading", {
				label: "The heading",
				max: HELLO_HEADING_MAX,
			}),
			// Forms send line breaks as \r\n; the box counted them as one.
			message: text(
				{
					message:
						typeof source.message === "string"
							? source.message.replace(/\r\n?/g, "\n")
							: "",
				},
				"message",
				{ label: "The message", max: HELLO_MESSAGE_MAX },
			),
		};
	})
	.handler(async ({ data }) => {
		await requireStaff();
		return saveHelloNote(data);
	});
