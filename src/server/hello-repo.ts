import { DEFAULT_HELLO_NOTE, type HelloNote } from "~/lib/hello-page";
import { getDb, nowIso } from "./db";

const KEY = "hello_note";

/** The note on /hello; the default until staff change it. */
export function getHelloNote(): HelloNote {
	const row = getDb()
		.query("SELECT value FROM settings WHERE key = $key")
		.get({ key: KEY }) as { value: string } | null;
	if (!row) return { ...DEFAULT_HELLO_NOTE };
	const saved = JSON.parse(row.value) as Partial<HelloNote>;
	return {
		heading:
			typeof saved.heading === "string"
				? saved.heading
				: DEFAULT_HELLO_NOTE.heading,
		message:
			typeof saved.message === "string"
				? saved.message
				: DEFAULT_HELLO_NOTE.message,
	};
}

export function saveHelloNote(note: HelloNote) {
	getDb()
		.query(
			`INSERT INTO settings (key, value, updated_at) VALUES ($key, $value, $now)
			 ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
		)
		.run({ key: KEY, value: JSON.stringify(note), now: nowIso() });
	return getHelloNote();
}
