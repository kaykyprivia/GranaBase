import { InputHTMLAttributes, forwardRef, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, id, type, ...props }, ref) => {
    const [showPassword, setShowPassword] = useState(false);
    const isPassword = type === "password";

    return (
      <div className="flex flex-col gap-1.5">
        <label htmlFor={id} className="text-sm font-medium text-acai-800">
          {label}
        </label>
        <div className="relative">
          <input
            ref={ref}
            id={id}
            type={isPassword && showPassword ? "text" : type}
            className={cn(
              "w-full rounded-xl border border-acai-200 px-4 py-3 text-acai-900 outline-none transition-colors focus:border-acai-500",
              isPassword && "pr-11",
              error && "border-red-400 focus:border-red-500",
              className
            )}
            {...props}
          />
          {isPassword && (
            <button
              type="button"
              tabIndex={-1}
              onClick={() => setShowPassword((prev) => !prev)}
              className="absolute inset-y-0 right-0 flex items-center px-3 text-acai-400 hover:text-acai-600"
              aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
            >
              {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
            </button>
          )}
        </div>
        {error && <span className="text-sm text-red-500">{error}</span>}
      </div>
    );
  }
);

Input.displayName = "Input";
