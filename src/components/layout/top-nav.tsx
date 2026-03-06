"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Package, Warehouse, ShoppingCart, BookmarkCheck } from "lucide-react";

const NAV_ITEMS = [
  { href: "/", label: "Products", icon: Package },
  { href: "/stock", label: "Stock", icon: Warehouse },
  { href: "/purchases", label: "Purchases", icon: ShoppingCart },
  { href: "/reservations", label: "Reservations", icon: BookmarkCheck },
];

export function TopNav() {
  const pathname = usePathname();

  return (
    <nav className="border-b bg-card">
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
  );
}
