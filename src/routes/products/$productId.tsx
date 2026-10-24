import { createFileRoute, Link, notFound } from "@tanstack/solid-router";
import { createMemo } from "solid-js";

import { ProductGallery } from "~/components/product/product-gallery";
import { ProductInfo } from "~/components/product/product-info";
import { VariantSelector } from "~/components/product/variant-selector";
import { SiteFooter } from "~/components/site/site-footer";
import { SiteHeader } from "~/components/site/site-header";
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbSeparator,
} from "~/components/ui/breadcrumb";
import { buttonVariants } from "~/components/ui/button";
import { getProduct } from "~/data/products";
import { resolveVariant } from "~/lib/product";
import { cn } from "~/lib/utils";
import type { ProductVariant } from "~/types/product";

interface ProductSearch {
	variant?: string;
}

export const Route = createFileRoute("/products/$productId")({
	validateSearch: (search: Record<string, unknown>): ProductSearch => ({
		variant: typeof search.variant === "string" ? search.variant : undefined,
	}),
	loader: ({ params }) => {
		const product = getProduct(params.productId);
		if (!product) throw notFound();
		return product;
	},
	head: ({ loaderData }) => ({
		meta: [
			{
				title: loaderData ? `${loaderData.title} · ORAIA` : "ORAIA",
			},
		],
	}),
	component: ProductPage,
	notFoundComponent: ProductNotFound,
});

const warmedVariants = new Set<string>();

/** Fetch a variant's gallery ahead of the click so the switch feels instant. */
function preloadVariantImages(variant: ProductVariant) {
	if (typeof window === "undefined" || warmedVariants.has(variant.id)) return;
	warmedVariants.add(variant.id);
	for (const src of variant.images) {
		const image = new Image();
		image.src = src;
	}
}

function ProductPage() {
	const product = Route.useLoaderData();
	const search = Route.useSearch();
	const navigate = Route.useNavigate();

	// The URL is the single source of truth for the selected variant.
	const activeVariant = createMemo(() =>
		resolveVariant(product(), search().variant),
	);

	const selectVariant = (variant: ProductVariant) => {
		if (variant.id === activeVariant().id) return;
		navigate({
			search: (prev) => ({ ...prev, variant: variant.id }),
			// Swapping colors shouldn't flood the back button with history entries.
			replace: true,
			resetScroll: false,
		});
	};

	return (
		<div class="min-h-screen bg-background">
			<SiteHeader />
			<main class="mx-auto max-w-6xl px-4 pb-16 pt-4 sm:px-6 lg:px-8">
				<Breadcrumb class="mb-4">
					<BreadcrumbList>
						<BreadcrumbItem>
							<BreadcrumbLink as={Link} to="/">
								Home
							</BreadcrumbLink>
						</BreadcrumbItem>
						<BreadcrumbSeparator />
						<BreadcrumbItem>
							<BreadcrumbLink current>{product().title}</BreadcrumbLink>
						</BreadcrumbItem>
					</BreadcrumbList>
				</Breadcrumb>

				<div class="grid gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-12">
					<ProductGallery
						images={activeVariant().images}
						label={`${product().title} in ${activeVariant().colorName}`}
						class="lg:sticky lg:top-20 lg:self-start"
					/>
					<ProductInfo product={product()} variant={activeVariant()}>
						<VariantSelector
							variants={product().variants}
							selectedId={activeVariant().id}
							onSelect={selectVariant}
							onPreview={preloadVariantImages}
						/>
					</ProductInfo>
				</div>
			</main>
			<SiteFooter />
		</div>
	);
}

function ProductNotFound() {
	return (
		<div class="flex min-h-screen flex-col bg-cream text-petal-900">
			<SiteHeader />
			<main class="flex flex-1 flex-col items-center justify-center gap-4 px-4 py-24 text-center">
				<h1 class="font-display font-soft text-3xl font-semibold">
					We couldn't find that bouquet
				</h1>
				<p class="text-petal-900/70">
					It may have sold out for the season or the link is mistyped.
				</p>
				<Link
					to="/"
					class={cn(
						buttonVariants(),
						"rounded-full bg-petal-700 px-6 text-white hover:bg-petal-900",
					)}
				>
					Back to the shop
				</Link>
			</main>
		</div>
	);
}
