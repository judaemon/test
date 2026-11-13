import { createServerFn } from "@tanstack/solid-start";

import { isLogArea } from "~/lib/activity-log";
import { isCalendarDate } from "~/lib/delivery-dates";
import { listLogs } from "../activity-log-repo";
import { requireStaff } from "../admin-auth";
import { asRecord, text } from "../validate";

const ACTOR_TYPES = ["staff", "customer", "system"] as const;
const day = (value: unknown) =>
	typeof value === "string" && isCalendarDate(value) ? value : undefined;

/** Admin → Logs: every change, newest first, filtered by area, item or person. */
export const listLogsFn = createServerFn({ method: "GET" })
	.validator((input: unknown) => {
		const source = asRecord(input ?? {});
		const page = Number(source.page ?? 1);
		const pageSize = Number(source.pageSize ?? 50);
		return {
			area: isLogArea(source.area) ? source.area : undefined,
			itemId: text(source, "itemId", { max: 80, required: false }),
			actor: text(source, "actor", { max: 120, required: false }),
			actorType: ACTOR_TYPES.find((type) => type === source.actorType),
			search: text(source, "search", { max: 120, required: false }),
			from: day(source.from),
			to: day(source.to),
			page: Number.isInteger(page) && page > 0 ? page : 1,
			pageSize: Number.isInteger(pageSize) ? pageSize : 50,
		};
	})
	.handler(async ({ data }) => {
		await requireStaff();
		return listLogs({
			area: data.area,
			itemId: data.itemId || undefined,
			actor: data.actor || undefined,
			actorType: data.actorType,
			search: data.search || undefined,
			from: data.from,
			to: data.to,
			page: data.page,
			pageSize: data.pageSize,
		});
	});
