/**
 * Supabase Auth Hook: reject sign-up when email is not on the allowlist.
 *
 * Deploy: supabase functions deploy before-user-created --no-verify-jwt
 * Then: Dashboard → Authentication → Hooks → Before user created → this function
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY secret on the function (auto in hosted Supabase).
 */
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = { "Content-Type": "application/json" };

Deno.serve(async (req) => {
  try {
    const payload = await req.json();
    const email = payload?.user?.email?.trim();

    if (!email) {
      return new Response(
        JSON.stringify({
          error: { message: "Email address is required.", http_code: 403 },
        }),
        { status: 403, headers: corsHeaders }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { data: allowed, error } = await supabase.rpc("is_email_allowed", {
      check_email: email,
    });

    if (error || !allowed) {
      return new Response(
        JSON.stringify({
          error: {
            message: "This Google account is not authorized to use this app.",
            http_code: 403,
          },
        }),
        { status: 403, headers: corsHeaders }
      );
    }

    return new Response(JSON.stringify({}), { status: 200, headers: corsHeaders });
  } catch (_err) {
    return new Response(
      JSON.stringify({
        error: { message: "Authorization check failed.", http_code: 500 },
      }),
      { status: 500, headers: corsHeaders }
    );
  }
});
