import Image from "next/image";
import { cn } from "@/lib/utils";

interface BrandLogoProps {
  className?: string;
  priority?: boolean;
}

export function BrandLogo({ className, priority = false }: BrandLogoProps) {
  return (
    <Image
      src="/brand/logomarca.png"
      alt="GranaBase"
      width={1254}
      height={1254}
      priority={priority}
      className={cn("h-auto w-auto object-contain", className)}
    />
  );
}
