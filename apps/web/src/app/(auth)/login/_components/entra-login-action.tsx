interface EntraLoginActionProps {
  href: string;
  disabled: boolean;
}

export function EntraLoginAction({ href, disabled }: EntraLoginActionProps) {
  if (disabled) {
    return (
      <button
        className="auth-action disabled"
        data-testid="entra-login-link"
        type="button"
        disabled
      >
        Continue with Microsoft Entra
      </button>
    );
  }

  return (
    <a className="auth-action" data-testid="entra-login-link" href={href}>
      Continue with Microsoft Entra
    </a>
  );
}
