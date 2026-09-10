"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import type { NavigationGroup } from "@/components/layout/navigation";

interface NavigationGroupsProps {
  groups: NavigationGroup[];
  storageKey: string;
  onNavigate?: () => void;
}

type ExpandedState = Record<NavigationGroup["id"], boolean>;

export function NavigationGroups({ groups, storageKey, onNavigate }: NavigationGroupsProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeGroupIds = useMemo(
    () =>
      new Set(
        groups
          .filter((group) => group.items.some((item) => isItemActive(item.href, pathname, searchParams) || item.children?.some((child) => isItemActive(child.href, pathname, searchParams))))
          .map((group) => group.id)
      ),
    [groups, pathname, searchParams]
  );
  const [expanded, setExpanded] = useState<ExpandedState>(() => ({
    finance: !pathname.startsWith("/business"),
    business: pathname.startsWith("/business"),
  }));

  useEffect(() => {
    const stored = window.localStorage.getItem(storageKey);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as Partial<ExpandedState>;
        setExpanded({
          finance: activeGroupIds.has("finance") || (parsed.finance ?? true),
          business: activeGroupIds.has("business") || (parsed.business ?? false),
        });
        return;
      } catch {
        window.localStorage.removeItem(storageKey);
      }
    }

    setExpanded((current) => ({
      finance: activeGroupIds.has("finance") || current.finance,
      business: activeGroupIds.has("business") || current.business,
    }));
  }, [activeGroupIds, storageKey]);

  useEffect(() => {
    window.localStorage.setItem(storageKey, JSON.stringify(expanded));
  }, [expanded, storageKey]);

  const toggleGroup = (groupId: NavigationGroup["id"]) => {
    setExpanded((current) => ({
      ...current,
      [groupId]: !current[groupId],
    }));
  };

  return (
    <div className="space-y-2">
      {groups.map((group) => {
        const isExpanded = expanded[group.id];
        const isActiveGroup = activeGroupIds.has(group.id);

        return (
          <section key={group.id} aria-labelledby={`nav-${group.id}`}>
            <button
              type="button"
              id={`nav-${group.id}`}
              aria-expanded={isExpanded}
              onClick={() => toggleGroup(group.id)}
              className={cn(
                "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold uppercase tracking-wider transition-colors",
                isActiveGroup
                  ? "bg-accent/10 text-accent"
                  : "text-text-muted hover:bg-border/40 hover:text-text-secondary"
              )}
            >
              <group.icon className="h-3.5 w-3.5 shrink-0" strokeWidth={1.8} />
              <span className="flex-1 text-left">{group.label}</span>
              <ChevronDown
                className={cn("h-3.5 w-3.5 shrink-0 transition-transform duration-200", isExpanded && "rotate-180")}
              />
            </button>

            <div
              aria-hidden={!isExpanded}
              className="grid transition-[grid-template-rows] duration-300 ease-out"
              style={{ gridTemplateRows: isExpanded ? "1fr" : "0fr" }}
            >
              <div className={cn("min-h-0 overflow-hidden", !isExpanded && "pointer-events-none")}>
                <div className="mt-1 space-y-0.5 border-l border-border/60 py-1 pl-2 ml-4">
                  {group.items.map((item) => {
                    const isActive = isItemActive(item.href, pathname, searchParams);
                    const Icon = item.icon;

                    if (item.disabled) {
                      return (
                        <div
                          key={item.href}
                          aria-disabled="true"
                          tabIndex={isExpanded ? undefined : -1}
                          className="flex cursor-not-allowed items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-text-muted/60"
                          title="Disponível nas próximas etapas"
                        >
                          <Icon className="h-[17px] w-[17px] shrink-0" strokeWidth={1.75} />
                          <span className="flex-1">{item.label}</span>
                        </div>
                      );
                    }

                    return (
                      <div key={item.href}>
                        <Link
                          href={item.href}
                          tabIndex={isExpanded ? undefined : -1}
                          onClick={onNavigate}
                          className={cn(
                            "relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150",
                            isActive
                              ? "bg-accent/10 text-accent"
                              : "text-text-secondary hover:bg-border/40 hover:text-text-primary"
                          )}
                        >
                          {isActive && (
                            <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r-full bg-accent" />
                          )}
                          <Icon
                            className={cn("h-[17px] w-[17px] shrink-0", isActive ? "text-accent" : "text-text-muted")}
                            strokeWidth={isActive ? 2 : 1.75}
                          />
                          <span className="flex-1">{item.label}</span>
                          {item.children && (
                            <ChevronDown
                              className={cn(
                                "h-3.5 w-3.5 shrink-0 transition-transform duration-200",
                                (isActive || item.children.some((child) => isItemActive(child.href, pathname, searchParams))) && "rotate-180"
                              )}
                            />
                          )}
                        </Link>

                        {item.children && (isActive || item.children.some((child) => isItemActive(child.href, pathname, searchParams))) && (
                          <div className="ml-[19px] mt-0.5 space-y-0.5 border-l border-border/60 py-0.5 pl-3">
                            {item.children.map((child) => {
                              const ChildIcon = child.icon;
                              const childActive = isItemActive(child.href, pathname, searchParams);

                              return (
                                <Link
                                  key={child.href}
                                  href={child.href}
                                  tabIndex={isExpanded ? undefined : -1}
                                  onClick={onNavigate}
                                  className={cn(
                                    "flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors",
                                    childActive
                                      ? "bg-border/70 font-medium text-text-primary"
                                      : "text-text-secondary hover:bg-border/50 hover:text-text-primary"
                                  )}
                                >
                                  <ChildIcon className="h-4 w-4 shrink-0" strokeWidth={childActive ? 2 : 1.75} />
                                  <span className="min-w-0 flex-1 break-words">{child.label}</span>
                                </Link>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </section>
        );
      })}
    </div>
  );
}

function isItemActive(href: string, pathname: string, searchParams: URLSearchParams): boolean {
  const [itemPathname, itemQuery] = href.split("?");

  if (itemQuery) {
    const expected = new URLSearchParams(itemQuery);
    return pathname === itemPathname && Array.from(expected.entries()).every(([key, value]) => searchParams.get(key) === value);
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}
