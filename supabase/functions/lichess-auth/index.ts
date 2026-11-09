import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const CLIENT_ID = "lag-free-ultrabullet.github.io";
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

type LichessAccount = {
  id: string;
  username: string;
  perfs?: {
    bullet?: { rating?: number };
    ultraBullet?: { rating?: number };
  };
};
type LichessEmail = { email?: string };

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  try {
    const body = await req.json();
    const code = typeof body.code === "string" ? body.code : "";
    const verifier = typeof body.codeVerifier === "string" ? body.codeVerifier : "";
    const redirectUri = typeof body.redirectUri === "string" ? body.redirectUri : "";
    if (!code || !/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) {
      return json({ error: "The Lichess sign-in response is invalid. Please try again." }, 400);
    }
    const redirect = new URL(redirectUri);
    const allowedRedirect =
      (redirect.origin === "https://forexpatriot77.github.io" &&
        redirect.pathname === "/lag-free-ultrabullet/") ||
      (redirect.origin === "http://localhost:5173" && redirect.pathname === "/");
    if (!allowedRedirect || redirect.search || redirect.hash) {
      return json({ error: "This sign-in redirect is not allowed." }, 400);
    }

    const tokenResponse = await fetch("https://lichess.org/api/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        code_verifier: verifier,
        client_id: CLIENT_ID,
        redirect_uri: redirectUri,
      }),
    });
    if (!tokenResponse.ok) {
      return json({ error: "Lichess could not verify this sign-in. Please try again." }, 401);
    }
    const tokenData = await tokenResponse.json();
    const accessToken = typeof tokenData.access_token === "string" ? tokenData.access_token : "";
    if (!accessToken) return json({ error: "Lichess did not return an access token." }, 401);

    const accountResponse = await fetch("https://lichess.org/api/account", {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
    });
    if (!accountResponse.ok) {
      return json({ error: "We couldn't verify your Lichess account." }, 401);
    }
    const account = await accountResponse.json() as LichessAccount;
    const lichessId = typeof account.id === "string" ? account.id.toLowerCase() : "";
    const lichessUsername = typeof account.username === "string" ? account.username : "";
    if (!lichessId || !lichessUsername) {
      return json({ error: "Lichess returned an incomplete account profile." }, 502);
    }

    // Email is only available through the separate endpoint and requires email:read.
    const emailResponse = await fetch("https://lichess.org/api/account/email", {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
    });
    if (!emailResponse.ok) {
      return json({ error: "Lichess did not provide permission to read your account email. Please try signing in again and approve email access." }, 403);
    }
    const emailData = await emailResponse.json() as LichessEmail;
    const accountEmail = typeof emailData.email === "string" ? emailData.email.trim().toLowerCase() : "";
    if (!accountEmail || !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(accountEmail)) {
      return json({ error: "Lichess did not return a usable email address for this account." }, 422);
    }

    const bullet = Number.isFinite(account.perfs?.bullet?.rating)
      ? Math.round(account.perfs!.bullet!.rating!) : null;
    const ultra = Number.isFinite(account.perfs?.ultraBullet?.rating)
      ? Math.round(account.perfs!.ultraBullet!.rating!) : null;

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SECRET_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) {
      return json({ error: "Account services are not configured on the server." }, 500);
    }
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    let { data: linked, error: lookupError } = await admin
      .from("lichess_accounts")
      .select("user_id")
      .eq("lichess_id", lichessId)
      .maybeSingle();
    if (lookupError) return json({ error: "Could not look up the Lichess account." }, 500);

    let userId = linked?.user_id as string | undefined;
    if (!userId) {
      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email: accountEmail,
        password: `${crypto.randomUUID()}-Aa9!`,
        email_confirm: true,
        user_metadata: { display_name: lichessUsername },
      });
      if (createError || !created.user) {
        return json({ error: "We couldn't create your Lag-Free account. Please try again." }, 500);
      }
      userId = created.user.id;
    }

    // Existing Lichess-linked users are upgraded from the old synthetic address
    // to the verified address returned by Lichess. Never request or reuse the Lichess password.
    const { data: authUserResult, error: authUserError } = await admin.auth.admin.getUserById(userId);
    if (authUserError || !authUserResult.user) {
      return json({ error: "Could not load your Lag-Free account." }, 500);
    }
    if ((authUserResult.user.email ?? "").toLowerCase() !== accountEmail) {
      const { error: emailUpdateError } = await admin.auth.admin.updateUserById(userId, {
        email: accountEmail,
        email_confirm: true,
      });
      if (emailUpdateError) {
        return json({ error: "This email is already connected to another Lag-Free account, or could not be updated. Sign in to that account first and contact support to link Lichess." }, 409);
      }
    }

    let base = lichessUsername.toLowerCase().replace(/[^a-z0-9_]/g, "_").replace(/_+/g, "_").slice(0, 20);
    if (base.length < 3) base = `lichess_${lichessId.slice(0, 8)}`.slice(0, 20);
    let username = base;
    const { data: currentProfile } = await admin.from("profiles")
      .select("username, display_name").eq("id", userId).maybeSingle();
    const suffix = lichessId.slice(0, 6);
    const { data: collision } = await admin.from("profiles")
      .select("id").eq("username", username).maybeSingle();
    if (collision && collision.id !== userId) username = `${base.slice(0, 13)}_${suffix}`.slice(0, 20);

    const profileUpdate: Record<string, string> = { username };
    if (!currentProfile?.display_name) profileUpdate.display_name = lichessUsername;
    const { error: profileError } = await admin.from("profiles").update(profileUpdate).eq("id", userId);
    if (profileError) return json({ error: "Your account was created, but its profile could not be prepared." }, 500);

    const { error: linkError } = await admin.from("lichess_accounts").upsert({
      lichess_id: lichessId,
      user_id: userId,
      lichess_username: lichessUsername,
      bullet_rating: bullet,
      ultrabullet_rating: ultra,
      updated_at: new Date().toISOString(),
    }, { onConflict: "lichess_id" });
    if (linkError) return json({ error: "Could not save the Lichess account connection." }, 500);

    const ratingUpdate: Record<string, number | string> = { user_id: userId };
    if (bullet !== null) ratingUpdate.hyperbullet_rating = bullet;
    if (ultra !== null) ratingUpdate.ultrabullet_rating = ultra;
    const { error: ratingError } = await admin.from("player_ratings").upsert(ratingUpdate, { onConflict: "user_id" });
    if (ratingError) return json({ error: "Your account was signed in, but ratings could not be imported." }, 500);

    const { data: magic, error: magicError } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: accountEmail,
    });
    const tokenHash = magic?.properties?.hashed_token;
    if (magicError || !tokenHash) {
      return json({ error: "Your Lichess account was verified, but Lag-Free couldn't finish signing you in." }, 500);
    }

    // The Lichess access token is intentionally not persisted or returned.
    return json({
      token_hash: tokenHash,
      username: lichessUsername,
      imported: { hyperbullet: bullet, ultrabullet: ultra },
    });
  } catch {
    return json({ error: "Lichess sign-in failed unexpectedly. Please try again." }, 500);
  }
});
