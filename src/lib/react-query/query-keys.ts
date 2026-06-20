export const authQuerykeys = {
  all: ['auth'] as const,
  me: () => [...authQuerykeys.all, 'me'] as const,
  signIn: () => [...authQuerykeys.all, 'signIn'] as const,
  signUp: () => [...authQuerykeys.all, 'signUp'] as const,
  signOut: () => [...authQuerykeys.all, 'signOut'] as const,
  signInWithGoogle: () => [...authQuerykeys.all, 'signInWithGoogle'] as const,
  signInWithMicrosoft: () => [...authQuerykeys.all, 'signInWithMicrosoft'] as const,
  signInWithApple: () => [...authQuerykeys.all, 'signInWithApple'] as const,
  signInWithGitHub: () => [...authQuerykeys.all, 'signInWithGitHub'] as const,
  signInWithTwitter: () => [...authQuerykeys.all, 'signInWithTwitter'] as const,
  signInWithFacebook: () => [...authQuerykeys.all, 'signInWithFacebook'] as const,
} as const;
