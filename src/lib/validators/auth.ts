import { z } from 'zod';

export const signInSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Enter a valid email address'),
  password: z
    .string()
    .min(1, 'Password is required')
    .min(8, 'Password must be at least 8 characters'),
});

export const signUpPayloadSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Enter a valid email address'),
  password: z
    .string()
    .min(1, 'Password is required')
    .min(8, 'Password must be at least 8 characters'),
  firstName: z
    .string()
    .min(1, 'First Name is required')
    .max(20, 'First Name must be less than 20 characters'),
  lastName: z
    .string()
    .min(1, 'Last Name is required')
    .max(20, 'Last Name must be less than 20 characters'),
});

export const signUpSchema = signUpPayloadSchema
  .extend({ confirmPassword: z.string().min(1, 'Please confirm your password') })
  .refine((values) => values.password === values.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export type SignInFormValues = z.infer<typeof signInSchema>;

export type SignUpFormValues = z.infer<typeof signUpSchema>;
