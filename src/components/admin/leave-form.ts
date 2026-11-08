import {
	type NavigateOptions,
	useNavigate,
	useRouter,
} from "@tanstack/solid-router";

/**
 * Leaving an admin form for the list that opened it, as it was (filters,
 * sort, page and scroll), by stepping back in history rather than opening
 * the list anew. Back afterwards then doesn't land on the form again.
 *
 * Lists pair this with `staleReloadMode: "blocking"` on their loader, so a
 * list stepped back to after a save waits for its fresh rows instead of
 * showing the old ones first and swapping them in.
 */
export function useLeaveForm(options: {
	/** The form's own route, which isn't reloaded: it's being left. */
	routeId: string;
	/** Where to go when there's nothing to step back to (a fresh tab). */
	fallback: NavigateOptions;
}) {
	const router = useRouter();
	const navigate = useNavigate();
	const canGoBack = () => router.history.canGoBack();

	/**
	 * After a save or delete: marks every other page out of date, so the list
	 * reloads when it's stepped back to, and reloads what's on screen now
	 * (the sidebar, say). `sync` waits for those, or leaving cuts them short.
	 */
	const refresh = () =>
		router.invalidate({
			filter: (match) => match.routeId !== options.routeId,
			sync: true,
		});

	/** Back to the list; `fallback` overrides the usual one. */
	const leave = async (fallback: NavigateOptions = options.fallback) => {
		if (canGoBack()) router.history.back();
		else await navigate({ ...fallback, replace: true });
	};

	/** For back and Cancel links: step back instead of adding a page. */
	const stepBack = (event: MouseEvent) => {
		if (!canGoBack()) return;
		event.preventDefault();
		router.history.back();
	};

	return { refresh, leave, stepBack };
}
