import { expect, test } from "bun:test";
import { siblingOrigins } from "./origins";

test("trusts the www and bare forms of the site's address", () => {
	expect(siblingOrigins("https://oraiashop.com")).toEqual([
		"https://www.oraiashop.com",
	]);
	expect(siblingOrigins("https://www.oraiashop.com/")).toEqual([
		"https://oraiashop.com",
	]);
});

test("adds nothing for local addresses or a missing one", () => {
	expect(siblingOrigins("http://localhost:3000")).toEqual([]);
	expect(siblingOrigins("http://127.0.0.1:3000")).toEqual([]);
	expect(siblingOrigins(undefined)).toEqual([]);
	expect(siblingOrigins("not a url")).toEqual([]);
});
