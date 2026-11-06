/** Longest chat message staff can paste into an order. */
export const CHAT_MESSAGE_MAX = 5000;
/** Most photos on one order added from a chat. */
export const CHAT_PHOTOS_MAX = 5;

/** Whether staff added this order from a chat (Admin → Add custom order). */
export function isChatOrder(order: { lines: { variantId: string }[] }) {
	return (
		order.lines.length === 1 && !!order.lines[0]?.variantId.startsWith("chat-")
	);
}

/** Where the customer reached the owner, for orders added from a chat. */
export const CONTACT_PLATFORMS = [
	"facebook",
	"signal",
	"whatsapp",
	"instagram",
	"telegram",
	"sms",
] as const;
export type ContactPlatform = (typeof CONTACT_PLATFORMS)[number];

export const CONTACT_PLATFORM_LABELS: Record<ContactPlatform, string> = {
	facebook: "Facebook",
	signal: "Signal",
	whatsapp: "WhatsApp",
	instagram: "Instagram",
	telegram: "Telegram",
	sms: "Text message",
};
