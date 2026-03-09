"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Package, Warehouse, ShoppingCart } from "lucide-react";

const NAV_ITEMS = [
  { href: "/", label: "Products", icon: Package },
  { href: "/stock", label: "Stock", icon: Warehouse },
  { href: "/purchases", label: "Purchases", icon: ShoppingCart },
];

export function TopNav() {
  const pathname = usePathname();

  return (
    <>
      {/* Desktop top nav */}
      <nav className="hidden border-b bg-card sm:block">
        <div className="flex h-14 items-center gap-1 px-6">
          <Link href="/" className="mr-6 text-lg font-bold tracking-tight">
            TechnoStore
          </Link>
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const isActive = href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Mobile bottom tab bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t bg-card/95 backdrop-blur-md sm:hidden">
        <div className="flex items-stretch" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const isActive = href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={`flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium transition-colors ${
                  isActive
                    ? "text-primary"
                    : "text-muted-foreground active:text-foreground"
                }`}
              >
                <Icon className={`h-5 w-5 ${isActive ? "text-primary" : ""}`} />
                {label}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
