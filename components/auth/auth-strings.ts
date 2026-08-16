// Bilingual strings for the auth UI. Inlined here (rather than added to
// the main dictionary) because:
//   1. Auth pages render BEFORE we have a user → locale → dictionary,
//      so picking a dictionary in middleware adds bootstrap complexity.
//   2. The auth strings are stable and tiny — easier to maintain in one
//      file next to the components that use them than mixed into the
//      app-wide dictionary.
//
// Locale picker logic lives in the components themselves (state +
// language toggle button), defaulting to Hebrew for the Israel launch.

export type AuthLocale = "he" | "en";

export const authStrings = {
  he: {
    languageName: "עברית",
    switchLanguage: "English",
    signup: {
      title: "פתחו חשבון",
      subtitle: "14 ימי ניסיון חינם · ללא כרטיס אשראי",
      emailLabel: "אימייל",
      emailPlaceholder: "you@example.com",
      passwordLabel: "סיסמה",
      passwordPlaceholder: "לפחות 8 תווים",
      passwordHint: "לפחות 8 תווים, אות גדולה ומספר",
      submit: "פתחו חשבון",
      submitting: "פותחים חשבון…",
      alreadyHaveAccount: "יש לכם כבר חשבון?",
      signinLink: "התחברו",
      terms: "בלחיצה על \"פתחו חשבון\" אתם מסכימים ל",
      termsLink: "תנאי השירות",
      and: "ול",
      privacyLink: "מדיניות הפרטיות",
      checkEmail: "בדקו את האימייל שלכם",
      checkEmailBody: "שלחנו לכם קישור אימות לכתובת",
      errors: {
        emailRequired: "נדרש אימייל.",
        emailInvalid: "אימייל לא תקין.",
        passwordRequired: "נדרשת סיסמה.",
        passwordTooShort: "סיסמה חייבת להכיל לפחות 8 תווים.",
        signupFailed: "פתיחת החשבון נכשלה. נסו שוב."
      }
    },
    forgot: {
      title: "איפוס סיסמה",
      subtitle: "נשלח לכם קישור לאיפוס הסיסמה",
      emailLabel: "אימייל",
      emailPlaceholder: "you@example.com",
      submit: "שלחו קישור איפוס",
      submitting: "שולח…",
      backToSignin: "חזרה להתחברות",
      checkInbox: "בדקו את האימייל",
      checkInboxBody: "אם הכתובת קיימת אצלנו, שלחנו קישור לאיפוס סיסמה."
    },
    reset: {
      title: "סיסמה חדשה",
      subtitle: "בחרו סיסמה חדשה לחשבון שלכם",
      passwordLabel: "סיסמה חדשה",
      passwordPlaceholder: "לפחות 8 תווים",
      confirmLabel: "אמתו סיסמה",
      submit: "עדכנו סיסמה",
      submitting: "מעדכן…",
      successTitle: "הסיסמה עודכנה",
      successBody: "התחברו עכשיו עם הסיסמה החדשה.",
      goToSignin: "עברו להתחברות",
      errors: {
        mismatch: "הסיסמאות לא תואמות.",
        invalidLink: "קישור איפוס לא תקין. בקשו קישור חדש.",
        tooShort: "סיסמה חייבת להכיל לפחות 8 תווים."
      }
    },
    signin: {
      title: "התחברות",
      subtitle: "ברוכים השבים",
      emailLabel: "אימייל",
      emailPlaceholder: "you@example.com",
      passwordLabel: "סיסמה",
      passwordPlaceholder: "הסיסמה שלכם",
      submit: "התחברו",
      submitting: "מתחברים…",
      forgotPassword: "שכחתם סיסמה?",
      noAccount: "אין לכם חשבון?",
      signupLink: "פתחו חשבון",
      errors: {
        emailRequired: "נדרש אימייל.",
        passwordRequired: "נדרשת סיסמה.",
        invalidCredentials: "פרטי התחברות שגויים.",
        signinFailed: "התחברות נכשלה. נסו שוב."
      }
    }
  },
  en: {
    languageName: "English",
    switchLanguage: "עברית",
    signup: {
      title: "Create your account",
      subtitle: "14-day free trial · No credit card required",
      emailLabel: "Email",
      emailPlaceholder: "you@example.com",
      passwordLabel: "Password",
      passwordPlaceholder: "At least 8 characters",
      passwordHint: "At least 8 characters, one uppercase, one number",
      submit: "Create account",
      submitting: "Creating account…",
      alreadyHaveAccount: "Already have an account?",
      signinLink: "Sign in",
      terms: "By creating an account you agree to our",
      termsLink: "Terms of Service",
      and: "and",
      privacyLink: "Privacy Policy",
      checkEmail: "Check your email",
      checkEmailBody: "We sent a verification link to",
      errors: {
        emailRequired: "Email is required.",
        emailInvalid: "That doesn't look like a valid email.",
        passwordRequired: "Password is required.",
        passwordTooShort: "Password must be at least 8 characters.",
        signupFailed: "Could not create account. Please try again."
      }
    },
    forgot: {
      title: "Reset password",
      subtitle: "We'll send you a link to set a new password",
      emailLabel: "Email",
      emailPlaceholder: "you@example.com",
      submit: "Send reset link",
      submitting: "Sending…",
      backToSignin: "← Back to sign in",
      checkInbox: "Check your inbox",
      checkInboxBody: "If that email exists in our system, we've sent you a reset link."
    },
    reset: {
      title: "New password",
      subtitle: "Choose a new password for your account",
      passwordLabel: "New password",
      passwordPlaceholder: "At least 8 characters",
      confirmLabel: "Confirm password",
      submit: "Update password",
      submitting: "Updating…",
      successTitle: "Password updated",
      successBody: "Sign in now with your new password.",
      goToSignin: "Go to sign in",
      errors: {
        mismatch: "Passwords don't match.",
        invalidLink: "Reset link is invalid. Request a new one.",
        tooShort: "Password must be at least 8 characters."
      }
    },
    signin: {
      title: "Sign in",
      subtitle: "Welcome back",
      emailLabel: "Email",
      emailPlaceholder: "you@example.com",
      passwordLabel: "Password",
      passwordPlaceholder: "Your password",
      submit: "Sign in",
      submitting: "Signing in…",
      forgotPassword: "Forgot your password?",
      noAccount: "Don't have an account?",
      signupLink: "Create one",
      errors: {
        emailRequired: "Email is required.",
        passwordRequired: "Password is required.",
        invalidCredentials: "Invalid email or password.",
        signinFailed: "Sign in failed. Please try again."
      }
    }
  }
} as const;
