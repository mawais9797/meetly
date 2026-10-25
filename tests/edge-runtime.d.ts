// Type-only bridge for checking the Deno function with the project's TypeScript
// compiler. Runtime imports and environment remain owned by Supabase Edge.
declare module 'npm:@supabase/supabase-js@2' {
  export const createClient: typeof import('@supabase/supabase-js').createClient;
}
declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Response | Promise<Response>): void;
};
