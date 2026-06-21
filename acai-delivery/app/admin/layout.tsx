import Link from "next/link";
import { LogoutButton } from "@/components/admin/logout-button";

const links = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/cardapio", label: "Cardápio" },
  { href: "/admin/cardapio/adicionais", label: "Adicionais" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-1 flex-col bg-acai-50">
      <header className="flex items-center justify-between border-b border-acai-100 bg-white px-6 py-4">
        <nav className="flex gap-6">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-acai-700 hover:text-acai-900"
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <LogoutButton />
      </header>
      <main className="flex flex-1 flex-col px-6 py-8">{children}</main>
    </div>
  );
}
