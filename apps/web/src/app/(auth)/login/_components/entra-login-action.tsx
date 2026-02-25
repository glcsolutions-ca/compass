"use client";

import { useState, type MouseEvent } from "react";

interface EntraLoginActionProps {
  href: string;
  disabled: boolean;
  describedById?: string;
}

export function EntraLoginAction({ href, disabled, describedById }: EntraLoginActionProps) {
  const [isRedirecting, setIsRedirecting] = useState(false);

  if (disabled) {
    return (
      <button
        className="auth-action disabled"
        data-testid="entra-login-link"
        type="button"
        aria-describedby={describedById}
        disabled
      >
        Continue with Microsoft Entra
      </button>
    );
  }

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (isRedirecting) {
      event.preventDefault();
      return;
    }

    setIsRedirecting(true);
  };

  return (
    <a
      className={`auth-action${isRedirecting ? " redirecting" : ""}`}
      data-testid="entra-login-link"
      href={href}
      aria-busy={isRedirecting}
      aria-describedby={describedById}
      aria-disabled={isRedirecting}
      onClick={handleClick}
    >
      {isRedirecting ? "Redirecting to Microsoft Entra..." : "Continue with Microsoft Entra"}
    </a>
  );
}
