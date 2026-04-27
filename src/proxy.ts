import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"
import { getToken } from "next-auth/jwt"
const NEXTAUTH_SALT = process.env.NODE_ENV === "production"
    ? "__Secure-authjs.session-token"
    : "authjs.session-token"

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // ── Admin route protection ────────────────────────────────────────────────
  // Check NextAuth JWT before doing any Supabase work.
  // getToken uses jose (Edge-compatible) — no Node.js bcrypt import needed here.
  if (pathname.startsWith("/admin")) {
    const token = await getToken({
      req: request,
      secret: process.env.NEXTAUTH_SECRET,
      salt: NEXTAUTH_SALT,
    })

    if (!token) {
      return NextResponse.redirect(new URL("/login", request.url))
    }
    if (token.role !== "admin") {
      // Authenticated but not admin — redirect away, never 404
      return NextResponse.redirect(new URL("/dashboard", request.url))
    }
  }

  // ── Admin API route protection ─────────────────────────────────────────────
  // /api/admin/* returns JSON 403, not a redirect — it's an API route.
  else if (pathname.startsWith("/api/admin")) {
    const token = await getToken({
      req: request,
      secret: process.env.NEXTAUTH_SECRET,
      salt: NEXTAUTH_SALT,
    })
    if (!token) return NextResponse.redirect(new URL("/login", request.url))
    if ((token.role as string) !== "admin") {
      return Response.json(
        { error: "You do not have permission to access this resource." },
        { status: 403 }
      )
    }
  }

  // ── App route protection (authenticated users only) ────────────────────────
  else if (
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/onboarding") ||
    pathname.startsWith("/notes") ||
    pathname.startsWith("/api/user") ||
    pathname.startsWith("/api/connections") ||
    pathname.startsWith("/api/notes") ||
    pathname.startsWith("/api/folders") ||
    pathname.startsWith("/api/activity")
  ) {
    const token = await getToken({
      req: request,
      secret: process.env.NEXTAUTH_SECRET,
      salt: NEXTAUTH_SALT,
    })
    if (!token) {
      const callbackUrl = encodeURIComponent(
        request.nextUrl.pathname + request.nextUrl.search
      )
      return NextResponse.redirect(
        new URL(`/login?callbackUrl=${callbackUrl}`, request.url)
      )
    }
    // Admins have no user_settings row — send them to their own panel
    if (
      (pathname.startsWith("/dashboard") ||
        pathname.startsWith("/onboarding") ||
        pathname.startsWith("/notes")) &&
      token.role === "admin"
    ) {
      return NextResponse.redirect(new URL("/admin", request.url))
    }
  }

  // ── Supabase SSR cookie refresh ───────────────────────────────────────────
  // Only needed if any server component creates a Supabase client via cookies.
  // NextAuth handles all auth — this just keeps Supabase anon session cookies fresh.
  const supabaseResponse = NextResponse.next({ request })
  
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )
  
  // Remove the supabase.auth.getUser() call — Mintmark uses NextAuth, not Supabase Auth.
  // That call was making a network round-trip to Supabase Auth on every request for nothing.
  
  return supabaseResponse
}

export const config = {
  matcher: [
    /*
     * Match all request paths except static files and images.
     * Supabase auth requires the proxy to run on every navigation.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}
