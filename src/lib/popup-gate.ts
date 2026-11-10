/**
 * One popup at a time: a page with something specific to say (an
 * arrangement's notice) claims the screen, and the shop-wide sale popup
 * waits for another visit instead of covering it.
 */
let claimed = false;

export function claimPopup() {
	claimed = true;
}

export const popupClaimed = () => claimed;
