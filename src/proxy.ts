import { NextResponse } from "next/server"
import { auth } from "@/auth"

export const proxy = auth((request) => {
  const { pathname, search } = request.nextUrl
  const session = request.auth

  if (pathname.startsWith("/admin")) {
    if (!session) {
      return NextResponse.redirect(new URL("/login", request.url))
    }
    if (session.user.role !== "admin") {
      return NextResponse.redirect(new URL("/dashboard", request.url))
    }

    return NextResponse.next()
  }

  if (pathname.startsWith("/api/admin")) {
    if (!session) {
      return Response.json(
        { error: "Authentication required" },
        { status: 401 }
      )
    }

    if (session.user.role !== "admin") {
      return Response.json(
        { error: "You do not have permission to access this resource." },
        { status: 403 }
      )
    }

    return NextResponse.next()
  }

  const protectedRoutes = [
    "/dashboard",
    "/onboarding",
    "/notes",
    "/api/user",
    "/api/connections",
    "/api/notes",
    "/api/folders",
    "/api/activity",
  ]

  const isProtectedRoute = protectedRoutes.some((route) => pathname.startsWith(route))

  if (isProtectedRoute) {
    if (!session) {
      const callbackUrl = encodeURIComponent(pathname + search)

      return NextResponse.redirect(
        new URL(`/login?callbackUrl=${callbackUrl}`, request.url)
      )
    }

    const userPages = [
      "/dashboard",
      "/onboarding",
      "/notes",
    ]

    const isUserPage = userPages.some((route) => pathname.startsWith(route))

    if (isUserPage && session.user.role === "admin") {
      return NextResponse.redirect(new URL("/admin", request.url))
    }

    return NextResponse.next()
  }

  return NextResponse.next()
})

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}
// export const config = {
//   matcher: [
//     "/admin/:path*",
//     "/api/admin/:path*",
//     "/dashboard/:path*",
//     "/onboarding/:path*",
//     "/notes/:path*",
//     "/api/user/:path*",
//     "/api/connections/:path*",
//     "/api/notes/:path*",
//     "/api/folders/:path*",
//     "/api/activity/:path*",
//   ],
// }
