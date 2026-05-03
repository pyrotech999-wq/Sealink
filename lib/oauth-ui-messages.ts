/** Maps `oauth_err` query values from `/api/auth/oauth/...` callbacks to user-facing text. */
export function oauthErrorMessage(code: string | null): string | null {
  if (!code) return null;
  switch (code.trim()) {
    case "state":
      return "That sign-in link expired or was invalid. Please try signing in with Google, Apple, or Facebook again.";
    case "token":
      return "The sign-in provider did not return a valid token. Try again, or use email and password.";
    case "email":
      return "We could not read an email address from that account. Check the permissions you granted, or sign up with email.";
    case "account":
      return "We could not create or load your account. Try again in a moment.";
    case "password_exists":
      return "An account with this email already uses a password. Sign in with your email and password instead.";
    case "supabase":
      return "Social sign-in is not available on this server yet.";
    case "mismatch":
      return "This email is already linked to a different sign-in method. Use the method you used originally.";
    case "config":
      return "That sign-in method is not configured. Try another option or use email and password.";
    case "disabled":
      return "Google and Facebook sign-in are not available on this site yet. Use email and password, or try again later.";
    default:
      return "Social sign-in did not complete. Please try again.";
  }
}
