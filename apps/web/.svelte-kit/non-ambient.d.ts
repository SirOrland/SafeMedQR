
// this file is generated — do not edit it


declare module "svelte/elements" {
	export interface HTMLAttributes<T> {
		'data-sveltekit-keepfocus'?: true | '' | 'off' | undefined | null;
		'data-sveltekit-noscroll'?: true | '' | 'off' | undefined | null;
		'data-sveltekit-preload-code'?:
			| true
			| ''
			| 'eager'
			| 'viewport'
			| 'hover'
			| 'tap'
			| 'off'
			| undefined
			| null;
		'data-sveltekit-preload-data'?: true | '' | 'hover' | 'tap' | 'off' | undefined | null;
		'data-sveltekit-reload'?: true | '' | 'off' | undefined | null;
		'data-sveltekit-replacestate'?: true | '' | 'off' | undefined | null;
	}
}

export {};


declare module "$app/types" {
	type MatcherParam<M> = M extends (param : string) => param is (infer U extends string) ? U : string;

	export interface AppTypes {
		RouteId(): "/" | "/dashboard" | "/dashboard/admin" | "/dashboard/doctor" | "/dashboard/pharmacy" | "/dashboard/supervisor";
		RouteParams(): {
			
		};
		LayoutParams(): {
			"/": Record<string, never>;
			"/dashboard": Record<string, never>;
			"/dashboard/admin": Record<string, never>;
			"/dashboard/doctor": Record<string, never>;
			"/dashboard/pharmacy": Record<string, never>;
			"/dashboard/supervisor": Record<string, never>
		};
		Pathname(): "/" | "/dashboard/admin" | "/dashboard/doctor" | "/dashboard/pharmacy" | "/dashboard/supervisor";
		ResolvedPathname(): `${"" | `/${string}`}${ReturnType<AppTypes['Pathname']>}`;
		Asset(): string & {};
	}
}