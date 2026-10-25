export const authQueryKeys = {
  all: ['auth'] as const,
  me: () => [...authQueryKeys.all, 'me'] as const,
  signIn: () => [...authQueryKeys.all, 'signIn'] as const,
  signUp: () => [...authQueryKeys.all, 'signUp'] as const,
  signOut: () => [...authQueryKeys.all, 'signOut'] as const,
  signInWithGoogle: () => [...authQueryKeys.all, 'signInWithGoogle'] as const,
  signInWithMicrosoft: () => [...authQueryKeys.all, 'signInWithMicrosoft'] as const,
  signInWithApple: () => [...authQueryKeys.all, 'signInWithApple'] as const,
  signInWithGitHub: () => [...authQueryKeys.all, 'signInWithGitHub'] as const,
  signInWithTwitter: () => [...authQueryKeys.all, 'signInWithTwitter'] as const,
  signInWithFacebook: () => [...authQueryKeys.all, 'signInWithFacebook'] as const,
} as const;
