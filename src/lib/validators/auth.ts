import { z } from 'zod';

export const signInSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Enter a valid email address'),
  password: z
    .string()
    .min(1, 'Password is required')
    .min(8, 'Password must be at least 8 characters'),
});

export const signUpSchema = z.object({
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
  //   phone: z
  //     .string()
  //     .min(1, 'Phone is required')
  //     .regex(/^\d{10}$/, 'Phone must be exactly 10 digits'),
  //   address: z
  //     .string()
  //     .min(1, 'Address is required'),
  //   city: z
  //     .string()
  //     .min(1, 'City is required'),
  //   state: z
  //     .string()
  //     .min(1, 'State is required'),
  //   zip: z
  //     .string()
  //     .min(1, 'Zip is required')
  //     .regex(/^\d{5}$/, 'Zip must be exactly 5 digits'),
  //   country: z
  //     .string()
  //     .min(1, 'Country is required'),
});

export type SignInFormValues = z.infer<typeof signInSchema>;

export type SignUpFormValues = z.infer<typeof signUpSchema>;
