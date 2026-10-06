import Link from "next/link";
import { signOut } from "@/auth";
import { APP_NAME } from "@/lib/brand";
import type { SessionUser } from "@/lib/session";

export function AppHeader({ user, children }: { user: SessionUser; children?: React.ReactNode }) {
  return (
    <header className="no-print sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="flex h-14 items-center gap-4 px-4 sm:px-6">
        <Link href="/projects" className="flex items-center gap-2 font-semibold text-slate-900">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-xs font-bold text-white">S</span>
          {APP_NAME}
        </Link>
        <div className="min-w-0 flex-1">{children}</div>
        <div className="flex items-center gap-3 text-sm">
          <span className="hidden text-slate-500 sm:inline">{user.name}</span>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/" });
            }}
          >
            <button className="rounded-lg px-2 py-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800">Sign out</button>
          </form>
        </div>
      </div>
    </header>
  );
}
