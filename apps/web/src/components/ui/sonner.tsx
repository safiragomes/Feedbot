import type { CSSProperties } from "react";
import { Toaster as Sonner, type ToasterProps } from "sonner";

export function Toaster({ theme = "dark", ...props }: ToasterProps) {
  return (
    <Sonner
      theme={theme}
      className="toaster"
      position="top-right"
      richColors
      style={
        {
          "--normal-bg": "var(--surface-2)",
          "--normal-text": "var(--text)",
          "--normal-border": "var(--border-strong)",
          "--success-bg": "var(--sage-dim)",
          "--success-text": "var(--sage)",
          "--success-border": "var(--sage-line)",
          "--error-bg": "var(--rose-dim)",
          "--error-text": "var(--rose)",
          "--error-border": "var(--rose-line)",
          "--font-sans": "var(--sans)",
          "--border-radius": "var(--r-md)",
        } as CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "feedbot-toast",
        },
      }}
      {...props}
    />
  );
}
